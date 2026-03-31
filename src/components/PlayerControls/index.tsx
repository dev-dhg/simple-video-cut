import React from 'react';
import { useAppStore } from '../../store';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import './index.css';

const PlayerControls: React.FC = () => {
    const { 
        currentTime, setCurrentTime,
        isPlaying, setIsPlaying,
        isMuted, setIsMuted
    } = useAppStore();

    const skipFrame = (amount: number) => {
        setCurrentTime(Math.max(0, currentTime + amount));
    };

    return (
        <div className="player-controls">
            <button className="playback-btn" onClick={() => skipFrame(-5)} title="Rewind 5s"><SkipBack size={20}/></button>
            <button className="playback-btn" onClick={() => skipFrame(-0.04)} title="Previous Frame"><ChevronLeft size={20}/></button>
            
            <button className="playback-btn play-btn" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause fill="currentColor" size={24}/> : <Play fill="currentColor" size={24} style={{marginLeft: '2px'}}/>}
            </button>
            
            <button className="playback-btn" onClick={() => skipFrame(0.04)} title="Next Frame"><ChevronRight size={20}/></button>
            <button className="playback-btn" onClick={() => skipFrame(5)} title="Forward 5s"><SkipForward size={20}/></button>
            
            <div className="controls-separator" />
            
            <button className="playback-btn mute-btn" onClick={() => setIsMuted(!isMuted)} title={isMuted ? "Unmute" : "Mute"}>
                {isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}
            </button>
        </div>
    );
};

export default PlayerControls;
