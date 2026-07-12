"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

interface Project {
  id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  project_status: string;
  progress_percentage: number;
}

interface ProjectContextValue {
  projects: Project[];
  selectedProjectId: string;
  selectedProject: Project | null;
  setSelectedProjectId: (id: string) => void;
  loading: boolean;
  refreshProjects: () => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  selectedProjectId: "",
  selectedProject: null,
  setSelectedProjectId: () => {},
  loading: true,
  refreshProjects: () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Hydrate from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const stored = localStorage.getItem("dcos_selected_project");
    if (stored) setSelectedProjectId(stored);
  }, []);
  const [loading, setLoading] = useState(true);

  function handleSetSelectedProjectId(id: string) {
    setSelectedProjectId(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("dcos_selected_project", id);
      else localStorage.removeItem("dcos_selected_project");
    }
  }

  function fetchProjects() {
    const supabase = createClient();
    setLoading(true);
    supabase.from("projects").select("id, project_code, project_name, project_type, project_status, progress_percentage").order("project_name", { ascending: true }).then(({ data }) => {
      if (data) setProjects(data as Project[]);
      setLoading(false);
    });
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const refreshProjects = fetchProjects;

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <ProjectContext.Provider value={{ projects, selectedProjectId, selectedProject, setSelectedProjectId: handleSetSelectedProjectId, loading, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
