import { ProjectCarousel } from "@/components/landing/project-carousel";
import { IsometricScene } from "@/components/landing/isometric-scene";
import { Building2, Brain, Globe } from "lucide-react";

const features = [
  {
    icon: Building2,
    text: "Real-time Collaboration",
  },
  {
    icon: Brain,
    text: "AI-Powered Insights",
  },
  {
    icon: Globe,
    text: "Global Compliance",
  },
];

export function LeftPanel() {
  return (
    <div className="relative flex flex-col justify-center overflow-hidden bg-zinc-900 text-white md:col-span-3 min-h-[50vh] md:min-h-screen">
      <ProjectCarousel />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/40 to-zinc-900/20" />
      <IsometricScene />
      <div className="relative z-10 flex flex-col gap-6 px-8 md:px-12 lg:px-16 py-12 md:py-0">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            DC/OS System
          </h1>
          <p className="mt-3 max-w-lg text-lg text-white/70 sm:text-xl">
            Next-Generation Construction Project Intelligence
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {features.map((feature) => (
            <div key={feature.text} className="flex items-center gap-3 text-white/80">
              <feature.icon className="h-5 w-5 shrink-0 text-blue-400" />
              <span className="text-sm sm:text-base">{feature.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
