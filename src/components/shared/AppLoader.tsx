
"use client";

import { useGlobalSettings } from "@/hooks/useGlobalSettings";

interface AppLoaderProps {
  text?: string;
}

export default function AppLoader({ text }: AppLoaderProps) {
  const { settings: globalSettings, isLoading } = useGlobalSettings();

  const appName =
    globalSettings?.websiteName ||
    process.env.NEXT_PUBLIC_WEBSITE_NAME ||
    "Loading";
  
  // Use the loaderType from settings, or a default if settings are not loaded yet
  const loaderType = isLoading ? "pulse" : (globalSettings?.loaderType || "pulse");

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      {/* ---------- ALL LOADER TYPES ---------- */}

      {loaderType === "pulse" && (
        <div className="flex flex-col items-center">
          <div className="pulse-ring"></div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "typing" && (
        <div className="flex flex-col items-center">
          <span className="typing">{appName}</span>
          {text && <p className="mt-4 text-lg text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "bars" && (
        <div className="flex flex-col items-center">
          <div className="bars-loader">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}></span>
            ))}
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "gradient" && (
        <div className="flex flex-col items-center">
          <div className="gradient-spinner"></div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "orbit" && (
        <div className="flex flex-col items-center">
          <div className="orbit">
            <div className="planet"></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "dots" && (
        <div className="flex flex-col items-center">
          <div className="dots-loader">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "progress" && (
        <div className="flex flex-col items-center w-64">
          <div className="progress-bar">
            <div className="progress"></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "cube" && (
        <div className="flex flex-col items-center">
          <div className="cube-loader">
            <div className="cube"></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "shine" && (
        <div className="flex flex-col items-center">
          <div className="shine-loader">
            <span>{appName}</span>
          </div>
          {text && <p className="mt-4 text-lg text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "bounce" && (
        <div className="flex flex-col items-center">
          <div className="bounce-loader">
            <div></div>
            <div></div>
            <div></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "ring" && (
        <div className="flex flex-col items-center">
          <div className="ring-loader"></div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "flip" && (
        <div className="flex flex-col items-center">
          <div className="flip-loader"></div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "wave" && (
        <div className="flex flex-col items-center">
          <div className="wave-loader">
            {[...Array(6)].map((_, i) => (
              <span key={i}></span>
            ))}
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
        </div>
      )}

      {loaderType === "heart" && (
        <div className="flex flex-col items-center">
          <div className="heart-loader"></div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
        </div>
      )}

      {loaderType === "matrix" && (
        <div className="flex flex-col items-center">
          <div className="matrix-loader">
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i}>|</span>
            ))}
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
        </div>
      )}

      {/* ---------- STYLES ---------- */}
      <style jsx>{`
        .pulse-ring {
          width: 60px;
          height: 60px;
          border: 4px solid hsl(var(--primary));
          border-radius: 50%;
          animation: pulse 1.5s ease-out infinite;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.9);
            opacity: 1;
          }
          100% {
            transform: scale(1.3);
            opacity: 0;
          }
        }

        .typing {
          font-size: 2rem;
          font-weight: 600;
          color: hsl(var(--primary));
          border-right: 3px solid hsl(var(--primary));
          white-space: nowrap;
          overflow: hidden;
          width: 0;
          animation: typing 2s steps(20, end) infinite alternate,
            blink 0.6s step-end infinite;
        }
        @keyframes typing {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }
        @keyframes blink {
          50% {
            border-color: transparent;
          }
        }

        .bars-loader {
          display: flex;
          gap: 6px;
          align-items: flex-end;
          height: 40px;
        }
        .bars-loader span {
          width: 6px;
          height: 100%;
          background-color: hsl(var(--primary));
          border-radius: 4px;
          animation: wave 1.2s ease-in-out infinite;
        }
        .bars-loader span:nth-child(2) {
          animation-delay: 0.1s;
        }
        .bars-loader span:nth-child(3) {
          animation-delay: 0.2s;
        }
        @keyframes wave {
          0%,
          100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1);
          }
        }

        .gradient-spinner {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: 4px solid transparent;
          background: conic-gradient(
            from 0deg,
            hsl(var(--primary)) 0deg,
            hsl(var(--primary) / 0.2) 120deg,
            hsl(var(--primary)) 240deg,
            hsl(var(--primary) / 0.2) 360deg
          );
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% {
            transform: rotate(360deg);
          }
        }

        .orbit {
          position: relative;
          width: 60px;
          height: 60px;
          border: 2px dashed hsl(var(--primary));
          border-radius: 50%;
          animation: rotate 2s linear infinite;
        }
        .planet {
          position: absolute;
          top: 0;
          left: 50%;
          width: 10px;
          height: 10px;
          background-color: hsl(var(--primary));
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }
        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }

        .dots-loader {
          display: flex;
          gap: 8px;
        }
        .dots-loader span {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: hsl(var(--primary));
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .dots-loader span:nth-child(1) {
          animation-delay: -0.32s;
        }
        .dots-loader span:nth-child(2) {
          animation-delay: -0.16s;
        }
        @keyframes bounce {
          0%,
          80%,
          100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          border-radius: 4px;
          background-color: hsl(var(--muted-foreground) / 0.2);
          overflow: hidden;
        }
        .progress {
          width: 50%;
          height: 100%;
          background-color: hsl(var(--primary));
          animation: load 1.5s linear infinite;
        }
        @keyframes load {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }

        .cube-loader {
            perspective: 120px;
        }
        .cube {
          width: 40px;
          height: 40px;
          background-color: hsl(var(--primary));
          animation: cube-rotate 1.2s infinite ease-in-out;
        }
        @keyframes cube-rotate {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(180deg);
          }
          100% {
            transform: rotateY(360deg);
          }
        }

        .shine-loader span {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(
            to right,
            hsl(var(--primary)) 20%,
            hsl(var(--primary) / 0.2) 40%,
            hsl(var(--primary)) 60%
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shine 2s linear infinite;
          background-size: 200% auto;
        }
        @keyframes shine {
          0% {
            background-position: 200% center;
          }
          100% {
            background-position: -200% center;
          }
        }

        .bounce-loader {
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        .bounce-loader div {
          width: 14px;
          height: 14px;
          background-color: hsl(var(--primary));
          border-radius: 50%;
          animation: bounce-up 1.2s infinite ease-in-out;
        }
        .bounce-loader div:nth-child(2) {
          animation-delay: 0.2s;
        }
        .bounce-loader div:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes bounce-up {
          0%,
          80%,
          100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-15px);
          }
        }

        .ring-loader {
          border: 4px solid hsl(var(--primary) / 0.2);
          border-top-color: hsl(var(--primary));
          border-radius: 50%;
          width: 60px;
          height: 60px;
          animation: spin 1s linear infinite;
        }

        .flip-loader {
          width: 40px;
          height: 40px;
          background-color: hsl(var(--primary));
          animation: flip 1.2s infinite ease-in-out;
          perspective: 120px;
        }
        @keyframes flip {
          0% {
            transform: rotateY(0deg) rotateX(0deg);
          }
          50% {
            transform: rotateY(180deg) rotateX(0deg);
          }
          100% {
            transform: rotateY(180deg) rotateX(180deg);
          }
        }

        .wave-loader {
          display: flex;
          gap: 5px;
          align-items: flex-end;
        }
        .wave-loader span {
          width: 6px;
          height: 20px;
          background: hsl(var(--primary));
          animation: wave-motion 1.2s infinite ease-in-out;
        }
        .wave-loader span:nth-child(odd) {
          animation-delay: 0.2s;
        }
        @keyframes wave-motion {
          0%,
          100% {
            height: 10px;
          }
          50% {
            height: 30px;
          }
        }

        .heart-loader {
          width: 40px;
          height: 40px;
          background-color: hsl(var(--primary));
          position: relative;
          transform: rotate(-45deg);
          animation: heartbeat 1s infinite;
        }
        .heart-loader:before,
        .heart-loader:after {
          content: "";
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: hsl(var(--primary));
        }
        .heart-loader:before {
          top: -20px;
          left: 0;
        }
        .heart-loader:after {
          left: 20px;
          top: 0;
        }
        @keyframes heartbeat {
          0%,
          100% {
            transform: scale(1) rotate(-45deg);
          }
          50% {
            transform: scale(1.2) rotate(-45deg);
          }
        }

        .matrix-loader {
          display: grid;
          grid-template-columns: repeat(10, 6px);
          gap: 4px;
          transform: skewY(-15deg);
        }
        .matrix-loader span {
          color: hsl(var(--primary));
          opacity: 0;
          animation: fall 1.5s linear infinite;
        }
        .matrix-loader span:nth-child(odd) {
          animation-delay: -0.5s;
        }
        @keyframes fall {
          0% {
            opacity: 0;
            transform: translateY(-20px);
          }
          30%, 70% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(20px);
          }
        }
      `}</style>
    </div>
  );
}
