import React, { useEffect, useRef } from 'react';
import { musicEngine } from '../../services/music/MusicEngine';
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
    const numParticles = 40;
    const particles = Array.from({ length: numParticles }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      baseRadius: Math.random() * 3 + 2,
      radius: Math.random() * 3 + 2,
      speedX: (Math.random() - 0.5) * 1.5,
      speedY: (Math.random() - 0.5) * 1.5,
      hue: (i * 9 + 210) % 360,
      alpha: Math.random() * 0.4 + 0.3,
    }));

    let phase = 0;

    const render = () => {
      if (document.hidden) {
        animFrameId.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const freqData = isPlaying ? musicEngine.getFrequencyData() : null;
      const bassEnergy = isPlaying ? musicEngine.getBassEnergy() : 0;
      const hasRealAudio = freqData !== null && freqData.length > 0;

      phase += isPlaying ? 0.03 + bassEnergy * 0.05 : 0.006;

      // 1. Render Background Aurora Glow reacting to Bass
      const glowGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        20,
        width / 2,
        height / 2,
        width * (0.5 + bassEnergy * 0.3)
      );
      glowGrad.addColorStop(0, `rgba(66, 133, 244, ${0.15 + bassEnergy * 0.25})`);
      glowGrad.addColorStop(0.5, `rgba(234, 67, 53, ${0.08 + bassEnergy * 0.15})`);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Real-Time Equalizer Bars (Rendered across bottom half)
      const numBars = 48;
      const barWidth = (width / numBars) * 0.65;
      const barGap = (width / numBars) * 0.35;
      const barBaseY = height * 0.78;

      for (let i = 0; i < numBars; i++) {
        let barHeight = 6;
        if (hasRealAudio && freqData) {
          // Map bar index to frequency bin with logarithmic scaling
          const binIdx = Math.min(
            freqData.length - 1,
            Math.floor(Math.pow(i / numBars, 1.3) * (freqData.length * 0.85))
          );
          const rawVal = freqData[binIdx] || 0;
          barHeight = Math.max(6, (rawVal / 255) * (height * 0.42));
        } else if (isPlaying) {
          // Synthetic pulsing wave when direct audio is active
          barHeight =
            12 + Math.sin(phase * 2 + i * 0.25) * 20 + Math.cos(phase * 1.5 + i * 0.15) * 15;
        }

        const barX = i * (barWidth + barGap) + barGap / 2;
        const barY = barBaseY - barHeight;

        // Gradient color for each bar
        const barGrad = ctx.createLinearGradient(barX, barBaseY, barX, barY);
        barGrad.addColorStop(0, 'rgba(66, 133, 244, 0.4)');
        barGrad.addColorStop(0.6, 'rgba(138, 180, 248, 0.85)');
        barGrad.addColorStop(1, '#ffffff');

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        // Rounded bar top
        ctx.roundRect(barX, barY, barWidth, barHeight, [4, 4, 0, 0]);
        ctx.fill();

        // Glow tip on energetic bars
        if (barHeight > 35) {
          ctx.shadowColor = '#8ab4f8';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(barX + barWidth / 2, barY, barWidth / 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // 3. Render Fluid Sine Ribbon Overlay
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const baseAlpha = layer === 0 ? 0.45 : layer === 1 ? 0.3 : 0.2;
        const colorGlow = layer === 0 ? '#4285f4' : layer === 1 ? '#ea4335' : '#fbbc05';

        ctx.strokeStyle = colorGlow;
        ctx.lineWidth = 2.5 - layer * 0.6;
        ctx.shadowColor = colorGlow;
        ctx.shadowBlur = 10 + bassEnergy * 15;

        const amplitude = (isPlaying ? 30 + bassEnergy * 45 : 10) + layer * 14;
        const frequency = 0.007 + layer * 0.003;

        for (let x = 0; x <= width; x += 6) {
          const y =
            height * 0.42 +
            Math.sin(x * frequency + phase + layer * 1.6) *
              amplitude *
              Math.sin(phase * 0.6 + x / width);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // 4. Floating Spectrum Particles that bounce with bass
      ctx.shadowBlur = 0;
      particles.forEach((p) => {
        if (isPlaying) {
          const speedMultiplier = 1 + bassEnergy * 2.5;
          p.x += p.speedX * speedMultiplier;
          p.y += p.speedY * speedMultiplier;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;
        }

        const dynamicRadius = p.baseRadius * (1 + bassEnergy * 1.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${p.alpha + bassEnergy * 0.3})`;
        ctx.shadowColor = `hsla(${p.hue}, 85%, 70%, 0.8)`;
        ctx.shadowBlur = 6 + bassEnergy * 10;
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
        <span>Live FFT Audio Spectrum & Aurora Atmosphere</span>
      </div>
    </div>
  );
};
