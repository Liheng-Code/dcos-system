"use client";

import { useEffect, useState } from "react";
import { listEmployeeSkills, listEmployeeSkillsWithSkills, listSkills } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap } from "lucide-react";

interface EmployeeSkill {
  id: string;
  proficiency_level: number;
  verified_date: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profiles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  skills: any;
}

interface SkillStat {
  skill_name: string;
  category: string;
  total_employees: number;
  avg_proficiency: number;
}

export default function CompetencyPage() {
  const [employeeSkills, setEmployeeSkills] = useState<EmployeeSkill[]>([]);
  const [skillStats, setSkillStats] = useState<SkillStat[]>([]);
  const [stats, setStats] = useState({
    total_skills: 0,
    total_proficient: 0,
    avg_proficiency: 0,
    categories: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Fetch skills overview
    listSkills()
      .then(({ data }) => {
        if (data) {
          const categories = new Set(data.map((s) => s.skill_category)).size;
          setStats((prev) => ({
            ...prev,
            total_skills: data.length,
            categories,
          }));
        }
      });

    // Fetch employee skill assignments
    listEmployeeSkills()
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setEmployeeSkills(data as any);

          // Calculate stats
          const proficient = data.filter((es) => es.proficiency_level >= 3).length;
          const avgProficiency = data.length > 0 ? data.reduce((sum, es) => sum + es.proficiency_level, 0) / data.length : 0;

          setStats((prev) => ({
            ...prev,
            total_proficient: proficient,
            avg_proficiency: parseFloat(avgProficiency.toFixed(2)),
          }));
        }
        setLoading(false);
      });

    // Fetch skill statistics by skill
    listEmployeeSkillsWithSkills()
      .then(({ data }) => {
        if (data) {
          const skillMap: Record<string, { category: string; levels: number[] }> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.forEach((es: any) => {
            const skill = Array.isArray(es.skills) ? es.skills[0] : es.skills;
            const skillName = skill?.skill_name;
            if (!skillName) return;
            if (!skillMap[skillName]) {
              skillMap[skillName] = { category: skill?.skill_category, levels: [] };
            }
            skillMap[skillName].levels.push(es.proficiency_level);
          });

          const stats = Object.entries(skillMap).map(([skillName, { category, levels }]) => ({
            skill_name: skillName,
            category: category || "uncategorized",
            total_employees: levels.length,
            avg_proficiency: parseFloat((levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(2)),
          }));

          setSkillStats(stats.sort((a, b) => b.total_employees - a.total_employees).slice(0, 8));
        }
      });
  }, []);

  const getProficiencyColor = (level: number) => {
    switch (true) {
      case level === 1:
        return "bg-red-50 text-red-700";
      case level === 2:
        return "bg-orange-50 text-orange-700";
      case level === 3:
        return "bg-yellow-50 text-yellow-700";
      case level === 4:
        return "bg-green-50 text-green-700";
      case level === 5:
        return "bg-blue-50 text-blue-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getProficiencyLabel = (level: number) => {
    const labels = ["", "Beginner", "Intermediate", "Advanced", "Expert", "Master"];
    return labels[level] || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Competency Management</h2>
          <p className="text-muted-foreground">Track employee skills and proficiency levels</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Assign Skill
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_skills}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Proficient Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_proficient}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Proficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.avg_proficiency.toFixed(1)}/5.0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Skill Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.categories}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Skills by Coverage</CardTitle>
            <CardDescription>Skills with most employees trained</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading skills...</p>
              </div>
            ) : skillStats.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No skill data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {skillStats.map((skill) => (
                  <div key={skill.skill_name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{skill.skill_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{skill.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">{skill.total_employees} employees</p>
                        <p className="text-xs text-muted-foreground">Avg: {skill.avg_proficiency}/5</p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(skill.avg_proficiency / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Skill Assignments</CardTitle>
            <CardDescription>Recently assigned employee skills</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading assignments...</p>
              </div>
            ) : employeeSkills.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No skill assignments found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {employeeSkills.slice(0, 10).map((es) => (
                  <div key={es.id} className="flex items-center justify-between p-2 text-sm border border-border rounded">
                    <div className="flex-1">
                      <p className="font-medium">{es.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{es.skills.skill_name}</p>
                    </div>
                    <Badge className={`text-xs ${getProficiencyColor(es.proficiency_level)}`}>
                      {getProficiencyLabel(es.proficiency_level)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
