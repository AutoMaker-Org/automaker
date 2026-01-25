import type { SpecOutput } from '@automaker/spec-parser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CheckCircle2,
  Circle,
  Clock,
  Cpu,
  FileCode2,
  FolderOpen,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  ScrollText,
  Wrench,
} from 'lucide-react';

interface SpecViewModeProps {
  spec: SpecOutput;
}

function StatusBadge({ status }: { status: 'completed' | 'in_progress' | 'pending' }) {
  const variants = {
    completed: { variant: 'success' as const, icon: CheckCircle2, label: 'Completed' },
    in_progress: { variant: 'warning' as const, icon: Clock, label: 'In Progress' },
    pending: { variant: 'muted' as const, icon: Circle, label: 'Pending' },
  };

  const { variant, icon: Icon, label } = variants[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

export function SpecViewMode({ spec }: SpecViewModeProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 max-w-4xl mx-auto">
        {/* Project Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">{spec.project_name}</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">{spec.overview}</p>
        </div>

        {/* Technology Stack */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cpu className="w-5 h-5 text-primary" />
              Technology Stack
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {spec.technology_stack.map((tech, index) => (
                <Badge key={index} variant="secondary" className="text-sm">
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Core Capabilities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="w-5 h-5 text-primary" />
              Core Capabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {spec.core_capabilities.map((capability, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Implemented Features */}
        {spec.implemented_features.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="w-5 h-5 text-primary" />
                Implemented Features
                <Badge variant="outline" className="ml-2">
                  {spec.implemented_features.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="multiple" className="w-full">
                {spec.implemented_features.map((feature, index) => (
                  <AccordionItem key={index} value={`feature-${index}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2 text-left">
                        <FileCode2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{feature.name}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pl-6">
                        <p className="text-muted-foreground">{feature.description}</p>
                        {feature.file_locations && feature.file_locations.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-sm font-medium flex items-center gap-1">
                              <FolderOpen className="w-4 h-4" />
                              File Locations:
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {feature.file_locations.map((loc, locIndex) => (
                                <li
                                  key={locIndex}
                                  className="font-mono text-xs bg-muted px-2 py-1 rounded"
                                >
                                  {loc}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Additional Requirements */}
        {spec.additional_requirements && spec.additional_requirements.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScrollText className="w-5 h-5 text-primary" />
                Additional Requirements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {spec.additional_requirements.map((req, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Circle className="w-2 h-2 text-muted-foreground mt-2 shrink-0 fill-current" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Development Guidelines */}
        {spec.development_guidelines && spec.development_guidelines.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wrench className="w-5 h-5 text-primary" />
                Development Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {spec.development_guidelines.map((guideline, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Circle className="w-2 h-2 text-muted-foreground mt-2 shrink-0 fill-current" />
                    <span>{guideline}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Implementation Roadmap */}
        {spec.implementation_roadmap && spec.implementation_roadmap.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapIcon className="w-5 h-5 text-primary" />
                Implementation Roadmap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {spec.implementation_roadmap.map((phase, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2 sm:w-48 shrink-0">
                      <StatusBadge status={phase.status} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{phase.phase}</p>
                      <p className="text-sm text-muted-foreground">{phase.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
