'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Feature } from '@/store/app-store';
import { Send, Loader2, HelpCircle, X } from 'lucide-react';
import type { ClarificationQuestion } from '@automaker/types';

/** Value used to represent the "Other" option in radio/checkbox groups */
const OTHER_OPTION_VALUE = '__other__';

interface ClarificationQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: Feature | null;
  questions: ClarificationQuestion[];
  requestId: string;
  onSubmit: (answers: Record<string, string>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ClarificationQuestionsDialog({
  open,
  onOpenChange,
  feature,
  questions,
  requestId,
  onSubmit,
  onCancel,
  isLoading = false,
}: ClarificationQuestionsDialogProps) {
  // State for answers: header -> selected option(s) or custom text
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [showOther, setShowOther] = useState<Record<string, boolean>>({});

  // Reset state when dialog opens or questions change
  useEffect(() => {
    if (open) {
      setAnswers({});
      setCustomTexts({});
      setShowOther({});
    }
  }, [open, requestId]);

  const handleSingleSelect = (header: string, value: string) => {
    if (value === OTHER_OPTION_VALUE) {
      setShowOther((prev) => ({ ...prev, [header]: true }));
      setAnswers((prev) => ({ ...prev, [header]: [] }));
    } else {
      setShowOther((prev) => ({ ...prev, [header]: false }));
      setAnswers((prev) => ({ ...prev, [header]: [value] }));
    }
  };

  const handleMultiSelect = (header: string, value: string, checked: boolean) => {
    if (value === OTHER_OPTION_VALUE) {
      setShowOther((prev) => ({ ...prev, [header]: checked }));
      if (!checked) {
        setCustomTexts((prev) => {
          const next = { ...prev };
          delete next[header];
          return next;
        });
      }
    } else {
      setAnswers((prev) => {
        const current = prev[header] || [];
        if (checked) {
          return { ...prev, [header]: [...current, value] };
        } else {
          return { ...prev, [header]: current.filter((v) => v !== value) };
        }
      });
    }
  };

  const handleCustomTextChange = (header: string, text: string) => {
    setCustomTexts((prev) => ({ ...prev, [header]: text }));
  };

  const handleSubmit = () => {
    // Build final answers
    const finalAnswers: Record<string, string> = {};

    for (const question of questions) {
      const header = question.header;
      const selected = answers[header] || [];
      const customText = customTexts[header];
      const isOther = showOther[header];

      if (isOther && customText) {
        // Include both selected options and custom text
        if (selected.length > 0) {
          finalAnswers[header] = `${selected.join(', ')}, Other: ${customText}`;
        } else {
          finalAnswers[header] = customText;
        }
      } else if (selected.length > 0) {
        finalAnswers[header] = selected.join(', ');
      }
    }

    onSubmit(finalAnswers);
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen && !isLoading) {
      onCancel();
    }
    onOpenChange(newOpen);
  };

  // Check if at least one question has an answer
  const hasAnyAnswer = questions.some((q) => {
    const header = q.header;
    const selected = answers[header] || [];
    const customText = customTexts[header];
    const isOther = showOther[header];
    return selected.length > 0 || (isOther && customText);
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="clarification-questions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Clarification Needed
          </DialogTitle>
          <DialogDescription>
            The AI has questions during the planning phase. Your answers will help create a better
            implementation plan.
            {feature && (
              <span className="block mt-2 text-primary">
                Feature: {feature.description.slice(0, 100)}
                {feature.description.length > 100 ? '...' : ''}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[60vh] space-y-6 py-4">
          {questions.map((question, index) => (
            <div
              key={`${question.header}-${index}`}
              className="space-y-3 p-4 rounded-lg border border-border bg-muted/30"
            >
              {/* Header badge */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {question.header}
                </Badge>
              </div>

              {/* Question text */}
              <Label className="text-base font-medium leading-relaxed">{question.question}</Label>

              {/* Options */}
              {question.multiSelect ? (
                // Multi-select with checkboxes
                <div className="space-y-2 pl-1">
                  {question.options.map((option, optIndex) => (
                    <div key={optIndex} className="flex items-start space-x-3">
                      <Checkbox
                        id={`${question.header}-${optIndex}`}
                        checked={(answers[question.header] || []).includes(option.label)}
                        onCheckedChange={(checked) =>
                          handleMultiSelect(question.header, option.label, checked as boolean)
                        }
                        disabled={isLoading}
                      />
                      <div className="flex flex-col">
                        <Label
                          htmlFor={`${question.header}-${optIndex}`}
                          className="font-medium cursor-pointer"
                        >
                          {option.label}
                        </Label>
                        {option.description && (
                          <span className="text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Other option */}
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id={`${question.header}-other`}
                      checked={showOther[question.header] || false}
                      onCheckedChange={(checked) =>
                        handleMultiSelect(question.header, OTHER_OPTION_VALUE, checked as boolean)
                      }
                      disabled={isLoading}
                    />
                    <div className="flex flex-col flex-1">
                      <Label
                        htmlFor={`${question.header}-other`}
                        className="font-medium cursor-pointer"
                      >
                        Other
                      </Label>
                      {showOther[question.header] && (
                        <Input
                          className="mt-2"
                          placeholder="Please specify..."
                          value={customTexts[question.header] || ''}
                          onChange={(e) => handleCustomTextChange(question.header, e.target.value)}
                          disabled={isLoading}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Single-select with radio buttons
                <RadioGroup
                  value={(answers[question.header] || [])[0] || ''}
                  onValueChange={(value) => handleSingleSelect(question.header, value)}
                  className="space-y-2 pl-1"
                  disabled={isLoading}
                >
                  {question.options.map((option, optIndex) => (
                    <div key={optIndex} className="flex items-start space-x-3">
                      <RadioGroupItem
                        value={option.label}
                        id={`${question.header}-${optIndex}`}
                        disabled={isLoading}
                      />
                      <div className="flex flex-col">
                        <Label
                          htmlFor={`${question.header}-${optIndex}`}
                          className="font-medium cursor-pointer"
                        >
                          {option.label}
                        </Label>
                        {option.description && (
                          <span className="text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Other option */}
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem
                      value="__other__"
                      id={`${question.header}-other`}
                      disabled={isLoading}
                    />
                    <div className="flex flex-col flex-1">
                      <Label
                        htmlFor={`${question.header}-other`}
                        className="font-medium cursor-pointer"
                      >
                        Other
                      </Label>
                      {showOther[question.header] && (
                        <Input
                          className="mt-2"
                          placeholder="Please specify..."
                          value={customTexts[question.header] || ''}
                          onChange={(e) => handleCustomTextChange(question.header, e.target.value)}
                          disabled={isLoading}
                        />
                      )}
                    </div>
                  </div>
                </RadioGroup>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !hasAnyAnswer}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
