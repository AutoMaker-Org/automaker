import { Plus, X, GripVertical, ChevronDown, ChevronUp, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ListChecks } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { SpecOutput } from '@automaker/spec-parser';

type Feature = SpecOutput['implemented_features'][number];

interface FeaturesSectionProps {
  features: Feature[];
  onChange: (features: Feature[]) => void;
}

interface FeatureCardProps {
  feature: Feature;
  index: number;
  onChange: (feature: Feature) => void;
  onRemove: () => void;
}

function FeatureCard({ feature, index, onChange, onRemove }: FeatureCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleNameChange = (name: string) => {
    onChange({ ...feature, name });
  };

  const handleDescriptionChange = (description: string) => {
    onChange({ ...feature, description });
  };

  const handleAddLocation = () => {
    const locations = feature.file_locations || [];
    onChange({ ...feature, file_locations: [...locations, ''] });
  };

  const handleRemoveLocation = (locIndex: number) => {
    const locations = feature.file_locations?.filter((_, i) => i !== locIndex);
    onChange({
      ...feature,
      file_locations: locations && locations.length > 0 ? locations : undefined,
    });
  };

  const handleLocationChange = (locIndex: number, value: string) => {
    const locations = [...(feature.file_locations || [])];
    locations[locIndex] = value;
    onChange({ ...feature, file_locations: locations });
  };

  return (
    <Card className="border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 p-3">
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab" />
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="p-1 h-auto">
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          <div className="flex-1 min-w-0">
            <Input
              value={feature.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Feature name..."
              className="font-medium"
            />
          </div>
          <Badge variant="outline" className="shrink-0">
            #{index + 1}
          </Badge>
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
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-4 border-t border-border pt-3 ml-10">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={feature.description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Describe what this feature does..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1">
                  <FolderOpen className="w-4 h-4" />
                  File Locations
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddLocation}
                  className="gap-1 h-7"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </div>
              {(feature.file_locations || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No file locations specified.</p>
              ) : (
                <div className="space-y-2">
                  {(feature.file_locations || []).map((location, locIndex) => (
                    <div key={locIndex} className="flex items-center gap-2">
                      <Input
                        value={location}
                        onChange={(e) => handleLocationChange(locIndex, e.target.value)}
                        placeholder="e.g., src/components/feature.tsx"
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveLocation(locIndex)}
                        className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function FeaturesSection({ features, onChange }: FeaturesSectionProps) {
  const handleAdd = () => {
    onChange([...features, { name: '', description: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(features.filter((_, i) => i !== index));
  };

  const handleFeatureChange = (index: number, feature: Feature) => {
    const newFeatures = [...features];
    newFeatures[index] = feature;
    onChange(newFeatures);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListChecks className="w-5 h-5 text-primary" />
          Implemented Features
          <Badge variant="outline" className="ml-2">
            {features.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {features.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No features added yet. Click below to add implemented features.
          </p>
        ) : (
          <div className="space-y-2">
            {features.map((feature, index) => (
              <FeatureCard
                key={index}
                feature={feature}
                index={index}
                onChange={(f) => handleFeatureChange(index, f)}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="gap-1">
          <Plus className="w-4 h-4" />
          Add Feature
        </Button>
      </CardContent>
    </Card>
  );
}
