import React from 'react';
import VideoPlayer from '../VideoPlayer';
import PlayerControls from '../PlayerControls';
import Timeline from '../Timeline';
import Sidebar from '../Sidebar';
import './index.css';

const VideoEditor: React.FC = () => {
  return (
    <div className="video-editor">
      <div className="editor-main">
        <div className="player-container">
          <VideoPlayer />
        </div>
        <PlayerControls />
        <div className="timeline-container">
          <Timeline />
        </div>
      </div>
      <Sidebar />
    </div>
  );
};

export default VideoEditor;
