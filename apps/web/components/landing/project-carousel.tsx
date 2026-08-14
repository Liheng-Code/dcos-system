"use client";

import { useEffect, useState } from "react";

const projects = [
  {
    name: "Burj Khalifa",
    location: "Dubai, UAE",
    src: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=1200&q=80",
  },
  {
    name: "Millau Viaduct",
    location: "Millau, France",
    src: "https://images.unsplash.com/photo-1541888946425-d81bb8b5e547?w=1200&q=80",
  },
  {
    name: "Panama Canal Expansion",
    location: "Panama",
    src: "https://images.unsplash.com/photo-1592670121372-97a31621c24a?w=1200&q=80",
  },
  {
    name: "Tokyo Skytree",
    location: "Tokyo, Japan",
    src: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1200&q=80",
  },
  {
    name: "Sydney Opera House",
    location: "Sydney, Australia",
    src: "https://images.unsplash.com/photo-1578922746465-3a80a228f223?w=1200&q=80",
  },
  {
    name: "Palm Jumeirah",
    location: "Dubai, UAE",
    src: "https://images.unsplash.com/photo-1582672060467-37bb9700c6d5?w=1200&q=80",
  },
  {
    name: "Channel Tunnel",
    location: "UK-France",
    src: "https://images.unsplash.com/photo-1566254976995-2756870d5eaa?w=1200&q=80",
  },
  {
    name: "Three Gorges Dam",
    location: "China",
    src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=80",
  },
];

export function ProjectCarousel() {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % projects.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0">
      {projects.map((project, i) => (
        <div
          key={project.name}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          <img
            src={project.src}
            alt={`${project.name} — ${project.location}`}
            className="h-full w-full object-cover"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ))}
      {projects.map((project, i) => (
        <div
          key={`caption-${project.name}`}
          className="absolute bottom-6 right-6 z-10 rounded-md bg-black/40 px-3 py-2 text-right backdrop-blur-sm transition-opacity duration-1000"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          <p className="text-sm font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{project.name}</p>
          <p className="text-xs font-medium text-white/80">{project.location}</p>
        </div>
      ))}
      {!loaded && (
        <div className="absolute inset-0 bg-zinc-900 animate-pulse" />
      )}
    </div>
  );
}
