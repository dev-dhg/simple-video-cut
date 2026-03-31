import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// @ts-ignore
const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const __dirname_fix = _dirname; // use this instead

// The built directory structure
// .
// ├── dist
// │   ├── index.html
// ├── dist-electron
// │   ├── main.js
// │   └── preload.js

process.env.APP_ROOT = path.join(__dirname_fix, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Simple Video Cut",
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname_fix, 'preload.cjs'),
    },
    autoHideMenuBar: true,
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);

// --- IPC Handlers ---

ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(win!, options);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(win!, options);
});

ipcMain.handle('run-ffmpeg', async (event, { ffmpegPath, args }) => {
  return new Promise((resolve, reject) => {
    const cmd = ffmpegPath || 'ffmpeg';
    console.log(`Running FFmpeg: ${cmd} ${args.join(' ')}`);
    
    const child = spawn(cmd, args);
    
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      win?.webContents.send('ffmpeg-log', data.toString());
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      // FFmpeg logs to stderr by default
      win?.webContents.send('ffmpeg-log', data.toString());
      
      // Try to parse progress if possible (optional enhancement)
      // FFmpeg progress format: 'frame=  ... fps= ... time=00:00:00.00 ...'
      const timeMatch = data.toString().match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch) {
         win?.webContents.send('ffmpeg-progress-raw', timeMatch[1]);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}\nStderr: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
});

ipcMain.handle('get-temp-path', () => {
  return app.getPath('temp');
});

ipcMain.handle('fs-write-file', async (event, { filePath, data }) => {
  // data is expected to be a Buffer or string
  fs.writeFileSync(filePath, Buffer.from(data));
  return true;
});

ipcMain.handle('fs-read-file', async (event, filePath) => {
  return fs.readFileSync(filePath);
});

ipcMain.handle('fs-unlink', async (event, filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
});

ipcMain.handle('get-ffmpeg-encoders', async (event, ffmpegPath) => {
  return new Promise((resolve) => {
    const cmd = ffmpegPath || 'ffmpeg';
    const child = spawn(cmd, ['-encoders']);
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', () => {
      const encoders: { name: string; description: string }[] = [];
      const lines = output.split('\n');
      
      // FFmpeg -encoders output format:
      //  V..... = Video
      //  A..... = Audio
      //  S..... = Subtitle
      //  .F.... = Frame-level multithreading
      //  ..S... = Slice-level multithreading
      //  ...X.. = Experimental
      //  ....B. = Supports draw_horiz_band
      //  .....D = Direct rendering method 1
      
      const encoderRegex = /V[.\w]+\s+([\w-]+)\s+(.+)$/;
      
      lines.forEach(line => {
        const match = line.trim().match(encoderRegex);
        if (match) {
          encoders.push({
            name: match[1],
            description: match[2]
          });
        }
      });

      if (encoders.length === 0 && output.length > 0) {
        console.log("No encoders matched. First 200 chars of output:", output.substring(0, 200));
      }
      
      resolve(encoders);
    });
    
    child.on('error', () => {
      resolve([]); // return empty on error
    });
  });
});
