import { Plus, X, Map as MapIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
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
import type { SpecOutput } from '@automaker/spec-parser';

type RoadmapPhase = NonNullable<SpecOutput['implementation_roadmap']>[number];
type PhaseStatus = 'completed' | 'in_progress' | 'pending';

interface PhaseWithId extends RoadmapPhase {
  _id: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

function phaseToInternal(phase: RoadmapPhase): PhaseWithId {
  return { ...phase, _id: generateId() };
}

function internalToPhase(internal: PhaseWithId): RoadmapPhase {
  const { _id, ...phase } = internal;
  return phase;
}

interface RoadmapSectionProps {
  phases: RoadmapPhase[];
  onChange: (phases: RoadmapPhase[]) => void;
}

interface PhaseCardProps {
  phase: PhaseWithId;
  onChange: (phase: PhaseWithId) => void;
  onRemove: () => void;
}

function PhaseCard({ phase, onChange, onRemove }: PhaseCardProps) {
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
                value={phase.description ?? ''}
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
  // Track phases with stable IDs
  const [items, setItems] = useState<PhaseWithId[]>(() => phases.map(phaseToInternal));

  // Track if we're making an internal change to avoid sync loops
  const isInternalChange = useRef(false);

  // Sync external phases to internal items when phases change externally
  // Preserve existing IDs where possible to avoid unnecessary remounts
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setItems((currentItems) => {
      return phases.map((phase, index) => {
        // Try to find existing item by index (positional matching)
        const existingItem = currentItems[index];
        if (existingItem) {
          // Reuse the existing ID, update the phase data
          return { ...phase, _id: existingItem._id };
        }
        // New phase - generate new ID
        return phaseToInternal(phase);
      });
    });
  }, [phases]);

  const handleAdd = () => {
    const newItems = [...items, phaseToInternal({ phase: '', status: 'pending', description: '' })];
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map(internalToPhase));
  };

  const handleRemove = (id: string) => {
    const newItems = items.filter((item) => item._id !== id);
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map(internalToPhase));
  };

  const handlePhaseChange = (id: string, phase: PhaseWithId) => {
    const newItems = items.map((item) => (item._id === id ? phase : item));
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map(internalToPhase));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapIcon className="w-5 h-5 text-primary" />
          Implementation Roadmap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No roadmap phases defined. Add phases to track implementation progress.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((phase) => (
              <PhaseCard
                key={phase._id}
                phase={phase}
                onChange={(p) => handlePhaseChange(phase._id, p)}
                onRemove={() => handleRemove(phase._id)}
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
