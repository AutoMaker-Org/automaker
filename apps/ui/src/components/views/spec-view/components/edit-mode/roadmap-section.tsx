import { Plus, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Map } from 'lucide-react';
import type { SpecOutput } from '@automaker/spec-parser';

type RoadmapPhase = NonNullable<SpecOutput['implementation_roadmap']>[number];
type PhaseStatus = 'completed' | 'in_progress' | 'pending';

interface RoadmapSectionProps {
  phases: RoadmapPhase[];
  onChange: (phases: RoadmapPhase[]) => void;
}

interface PhaseCardProps {
  phase: RoadmapPhase;
  index: number;
  onChange: (phase: RoadmapPhase) => void;
  onRemove: () => void;
}

function PhaseCard({ phase, index: _index, onChange, onRemove }: PhaseCardProps) {
  const handlePhaseNameChange = (name: string) => {
    onChange({ ...phase, phase: name });
  };

  const handleStatusChange = (status: PhaseStatus) => {
    onChange({ ...phase, status });
  };

  const handleDescriptionChange = (description: string) => {
    onChange({ ...phase, description });
  };

  return (
    <Card className="border-border">
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-2 cursor-grab" />
          <div className="flex-1 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Label className="sr-only">Phase Name</Label>
                <Input
                  value={phase.phase}
                  onChange={(e) => handlePhaseNameChange(e.target.value)}
                  placeholder="Phase name..."
                />
              </div>
              <div className="w-full sm:w-40">
                <Label className="sr-only">Status</Label>
                <Select value={phase.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="sr-only">Description</Label>
              <Textarea
                value={phase.description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Describe what this phase involves..."
                rows={2}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function RoadmapSection({ phases, onChange }: RoadmapSectionProps) {
  const handleAdd = () => {
    onChange([...phases, { phase: '', status: 'pending', description: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(phases.filter((_, i) => i !== index));
  };

  const handlePhaseChange = (index: number, phase: RoadmapPhase) => {
    const newPhases = [...phases];
    newPhases[index] = phase;
    onChange(newPhases);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Map className="w-5 h-5 text-primary" />
          Implementation Roadmap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {phases.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No roadmap phases defined. Add phases to track implementation progress.
          </p>
        ) : (
          <div className="space-y-2">
            {phases.map((phase, index) => (
              <PhaseCard
                key={index}
                phase={phase}
                index={index}
                onChange={(p) => handlePhaseChange(index, p)}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="gap-1">
          <Plus className="w-4 h-4" />
          Add Phase
        </Button>
      </CardContent>
    </Card>
  );
}
