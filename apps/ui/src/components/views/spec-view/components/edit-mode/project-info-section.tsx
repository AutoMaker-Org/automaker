import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileText } from 'lucide-react';

interface ProjectInfoSectionProps {
  projectName: string;
  overview: string;
  onProjectNameChange: (value: string) => void;
  onOverviewChange: (value: string) => void;
}

export function ProjectInfoSection({
  projectName,
  overview,
  onProjectNameChange,
  onOverviewChange,
}: ProjectInfoSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="w-5 h-5 text-primary" />
          Project Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project Name</Label>
          <Input
            id="project-name"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="Enter project name..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="overview">Overview</Label>
          <Textarea
            id="overview"
            value={overview}
            onChange={(e) => onOverviewChange(e.target.value)}
            placeholder="Describe what this project does, its purpose, and key goals..."
            rows={5}
          />
        </div>
      </CardContent>
    </Card>
  );
}
