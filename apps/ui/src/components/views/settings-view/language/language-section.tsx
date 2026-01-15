import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Languages, RotateCcw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LanguageInstruction } from '@automaker/types';
import {
  LANGUAGE_TEMPLATES,
  getLanguageTemplate,
  getDefaultLanguageInstruction,
} from '@automaker/prompts';

interface LanguageSectionProps {
  languageInstruction?: LanguageInstruction;
  onLanguageInstructionChange: (instruction: LanguageInstruction | undefined) => void;
}

/**
 * LanguageSection Component
 *
 * Allows users to configure the language in which AI agents respond.
 * Features:
 * - Dropdown to select language (loads default instruction template)
 * - Toggle to enable/disable the language instruction
 * - Editable textarea for customizing the instruction
 * - Reset button to restore default template for selected language
 */
export function LanguageSection({
  languageInstruction,
  onLanguageInstructionChange,
}: LanguageSectionProps) {
  const isEnabled = languageInstruction?.enabled ?? false;
  const selectedLanguage = languageInstruction?.language ?? 'english';
  const currentInstruction =
    languageInstruction?.instruction ?? getDefaultLanguageInstruction(selectedLanguage);

  const handleLanguageChange = (languageId: string) => {
    const template = getLanguageTemplate(languageId);
    if (template) {
      onLanguageInstructionChange({
        language: languageId,
        instruction: template.instruction,
        enabled: isEnabled,
      });
    }
  };

  const handleToggle = (enabled: boolean) => {
    onLanguageInstructionChange({
      language: selectedLanguage,
      instruction: currentInstruction,
      enabled,
    });
  };

  const handleInstructionChange = (instruction: string) => {
    onLanguageInstructionChange({
      language: selectedLanguage,
      instruction,
      enabled: isEnabled,
    });
  };

  const handleReset = () => {
    const defaultInstruction = getDefaultLanguageInstruction(selectedLanguage);
    onLanguageInstructionChange({
      language: selectedLanguage,
      instruction: defaultInstruction,
      enabled: isEnabled,
    });
  };

  const selectedTemplate = getLanguageTemplate(selectedLanguage);
  const isModified = currentInstruction !== selectedTemplate?.instruction;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Languages className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Response Language
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure the language in which AI agents respond.
        </p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Info Banner */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              When enabled, this instruction is prepended to all AI system prompts. The AI will
              respond in the selected language while keeping code and technical identifiers in
              English.
            </p>
          </div>
        </div>

        {/* Enable Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
            <Languages className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Enable Language Instruction</Label>
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                className="data-[state=checked]:bg-brand-500"
              />
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, the language instruction is added to all AI prompts.
            </p>
          </div>
        </div>

        {/* Language Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Language</Label>
            <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} ({template.nativeName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Select a language to load its default instruction template.
          </p>
        </div>

        {/* Instruction Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Instruction</Label>
            {isModified && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset to Default
              </Button>
            )}
          </div>
          <Textarea
            value={currentInstruction}
            onChange={(e) => handleInstructionChange(e.target.value)}
            placeholder="Enter language instruction..."
            className={cn('font-mono text-xs resize-y min-h-[150px]', !isEnabled && 'opacity-50')}
          />
          <p className="text-xs text-muted-foreground">
            This instruction is prepended to all AI system prompts. You can customize it to fit your
            needs.
          </p>
        </div>
      </div>
    </div>
  );
}
