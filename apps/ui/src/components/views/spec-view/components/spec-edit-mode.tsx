import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpecOutput } from '@automaker/spec-parser';
import { specToXml } from '@automaker/spec-parser';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ProjectInfoSection,
  TechStackSection,
  CapabilitiesSection,
  FeaturesSection,
  RoadmapSection,
  RequirementsSection,
  GuidelinesSection,
} from './edit-mode';

interface SpecEditModeProps {
  spec: SpecOutput;
  onChange: (xmlContent: string) => void;
}

export function SpecEditMode({ spec, onChange }: SpecEditModeProps) {
  // Local state for form editing
  const [formData, setFormData] = useState<SpecOutput>(spec);

  // Track the last spec we synced FROM to detect external changes
  const lastExternalSpecRef = useRef<string>(JSON.stringify(spec));

  // Flag to prevent re-syncing when we caused the change
  const isInternalChangeRef = useRef(false);

  // Reset form only when spec changes externally (e.g., after save, sync, or regenerate)
  useEffect(() => {
    const specJson = JSON.stringify(spec);

    // If we caused this change (internal), just update the ref and skip reset
    if (isInternalChangeRef.current) {
      lastExternalSpecRef.current = specJson;
      isInternalChangeRef.current = false;
      return;
    }

    // External change - reset form data
    if (specJson !== lastExternalSpecRef.current) {
      lastExternalSpecRef.current = specJson;
      setFormData(spec);
    }
  }, [spec]);

  // Update a field and notify parent
  const updateField = useCallback(
    <K extends keyof SpecOutput>(field: K, value: SpecOutput[K]) => {
      setFormData((prev) => {
        const newData = { ...prev, [field]: value };
        // Mark as internal change before notifying parent
        isInternalChangeRef.current = true;
        const xmlContent = specToXml(newData);
        onChange(xmlContent);
        return newData;
      });
    },
    [onChange]
  );

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-6 max-w-4xl mx-auto">
        {/* Project Information */}
        <ProjectInfoSection
          projectName={formData.project_name}
          overview={formData.overview}
          onProjectNameChange={(value) => updateField('project_name', value)}
          onOverviewChange={(value) => updateField('overview', value)}
        />

        {/* Technology Stack */}
        <TechStackSection
          technologies={formData.technology_stack}
          onChange={(value) => updateField('technology_stack', value)}
        />

        {/* Core Capabilities */}
        <CapabilitiesSection
          capabilities={formData.core_capabilities}
          onChange={(value) => updateField('core_capabilities', value)}
        />

        {/* Implemented Features */}
        <FeaturesSection
          features={formData.implemented_features}
          onChange={(value) => updateField('implemented_features', value)}
        />

        {/* Additional Requirements (Optional) */}
        <RequirementsSection
          requirements={formData.additional_requirements || []}
          onChange={(value) =>
            updateField('additional_requirements', value.length > 0 ? value : undefined)
          }
        />

        {/* Development Guidelines (Optional) */}
        <GuidelinesSection
          guidelines={formData.development_guidelines || []}
          onChange={(value) =>
            updateField('development_guidelines', value.length > 0 ? value : undefined)
          }
        />

        {/* Implementation Roadmap (Optional) */}
        <RoadmapSection
          phases={formData.implementation_roadmap || []}
          onChange={(value) =>
            updateField('implementation_roadmap', value.length > 0 ? value : undefined)
          }
        />
      </div>
    </ScrollArea>
  );
}
