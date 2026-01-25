import { Plus, X, ChevronDown, ChevronUp, FolderOpen } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
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

interface FeatureWithId extends Feature {
  _id: string;
  _locationIds?: string[];
}

function generateId(): string {
  return crypto.randomUUID();
}

function featureToInternal(feature: Feature): FeatureWithId {
  return {
    ...feature,
    _id: generateId(),
    _locationIds: feature.file_locations?.map(() => generateId()),
  };
}

function internalToFeature(internal: FeatureWithId): Feature {
  const { _id, _locationIds, ...feature } = internal;
  return feature;
}

interface FeatureCardProps {
  feature: FeatureWithId;
  index: number;
  onChange: (feature: FeatureWithId) => void;
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
    const locationIds = feature._locationIds || [];
    onChange({
      ...feature,
      file_locations: [...locations, ''],
      _locationIds: [...locationIds, generateId()],
    });
  };

  const handleRemoveLocation = (locId: string) => {
    const locationIds = feature._locationIds || [];
    const idx = locationIds.indexOf(locId);
    if (idx === -1) return;

    const newLocations = feature.file_locations?.filter((_, i) => i !== idx);
    const newLocationIds = locationIds.filter((id) => id !== locId);
    onChange({
      ...feature,
      file_locations: newLocations && newLocations.length > 0 ? newLocations : undefined,
      _locationIds: newLocationIds.length > 0 ? newLocationIds : undefined,
    });
  };

  const handleLocationChange = (locId: string, value: string) => {
    const locationIds = feature._locationIds || [];
    const idx = locationIds.indexOf(locId);
    if (idx === -1) return;

    const locations = [...(feature.file_locations || [])];
    locations[idx] = value;
    onChange({ ...feature, file_locations: locations });
  };

  return (
    <Card className="border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 p-3">
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
                  {(feature.file_locations || []).map((location, idx) => {
                    const locId = feature._locationIds?.[idx] || `fallback-${idx}`;
                    return (
                      <div key={locId} className="flex items-center gap-2">
                        <Input
                          value={location}
                          onChange={(e) => handleLocationChange(locId, e.target.value)}
                          placeholder="e.g., src/components/feature.tsx"
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLocation(locId)}
                          className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
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
  // Track features with stable IDs
  const [items, setItems] = useState<FeatureWithId[]>(() => features.map(featureToInternal));

  // Track if we're making an internal change to avoid sync loops
  const isInternalChange = useRef(false);

  // Sync external features to internal items when features change externally
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setItems(features.map(featureToInternal));
  }, [features]);

  const handleAdd = () => {
    const newItems = [...items, featureToInternal({ name: '', description: '' })];
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map(internalToFeature));
  };

  const handleRemove = (id: string) => {
    const newItems = items.filter((item) => item._id !== id);
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map(internalToFeature));
  };

  const handleFeatureChange = (id: string, feature: FeatureWithId) => {
    const newItems = items.map((item) => (item._id === id ? feature : item));
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map(internalToFeature));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListChecks className="w-5 h-5 text-primary" />
          Implemented Features
          <Badge variant="outline" className="ml-2">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No features added yet. Click below to add implemented features.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((feature, index) => (
              <FeatureCard
                key={feature._id}
                feature={feature}
                index={index}
                onChange={(f) => handleFeatureChange(feature._id, f)}
                onRemove={() => handleRemove(feature._id)}
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
