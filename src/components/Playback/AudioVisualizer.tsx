import React, { useEffect, useRef } from 'react';
import './AudioVisualizer.css';

interface AudioVisualizerProps {
  isPlaying: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 600);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 400);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particle nodes for fluid floating aura
    const numParticles = 48;
    const particles = Array.from({ length: numParticles }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 3.5 + 1.5,
      speedX: (Math.random() - 0.5) * 1.2,
      speedY: (Math.random() - 0.5) * 1.2,
      hue: (i * 7 + 210) % 360, // Cyan, Google Blue, Purple spectrum
      alpha: Math.random() * 0.5 + 0.3,
    }));

    let phase = 0;

    const render = () => {
      if (document.hidden) {
        animFrameId.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Waveform bars / sine flow
      phase += isPlaying ? 0.04 : 0.008;

      // Draw multi-layered glowing sine waves
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const baseAlpha = layer === 0 ? 0.45 : layer === 1 ? 0.3 : 0.2;
        const colorGlow = layer === 0 ? '#ff453a' : layer === 1 ? '#ff7b72' : '#e50914';

        ctx.strokeStyle = colorGlow;
        ctx.lineWidth = 3 - layer * 0.8;
        ctx.shadowColor = colorGlow;
        ctx.shadowBlur = 12;

        const amplitude = (isPlaying ? 35 : 12) + layer * 15;
        const frequency = 0.008 + layer * 0.004;

        for (let x = 0; x <= width; x += 6) {
          const y =
            height / 2 +
            Math.sin(x * frequency + phase + layer * 1.5) * amplitude * Math.sin(phase * 0.5 + x / width);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Render floating spectrum particles
      ctx.shadowBlur = 0;
      particles.forEach((p) => {
        if (isPlaying) {
          p.x += p.speedX;
          p.y += p.speedY;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (isPlaying ? 1.2 : 0.9), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${p.alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 85%, 70%, 0.8)`;
        ctx.shadowBlur = 8;
        ctx.fill();
      });

      animFrameId.current = requestAnimationFrame(render);
    };

    const handleVisibility = () => {
      if (!document.hidden && !animFrameId.current) {
        render();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [isPlaying]);

  return (
    <div className="tv-audio-visualizer-box">
      <canvas ref={canvasRef} className="tv-audio-visualizer-canvas" />
      <div className="tv-visualizer-tag">
        <span className="tv-pulse-dot" />
        <span>Live Spectrum & Aurora Atmosphere</span>
      </div>
    </div>
  );
};
