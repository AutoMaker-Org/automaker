/**
 * Security Step Configuration
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PipelineStepConfig, SecurityConfig } from '@automaker/types';

interface SecurityStepConfigProps {
  config: PipelineStepConfig;
  onChange: (config: PipelineStepConfig) => void;
}

export function SecurityStepConfig({ config, onChange }: SecurityStepConfigProps) {
  const securityConfig = (config.config as SecurityConfig) || {};

  const updateConfig = (updates: Partial<SecurityConfig>) => {
    onChange({
      ...config,
      config: {
        ...securityConfig,
        ...updates,
      },
    });
  };

  const checklistItems = [
    {
      id: 'sql-injection',
      label: 'SQL Injection',
      description: 'Check for unsafe database queries',
    },
    { id: 'xss', label: 'XSS', description: 'Look for cross-site scripting vulnerabilities' },
    {
      id: 'authentication',
      label: 'Authentication',
      description: 'Verify proper authentication mechanisms',
    },
    { id: 'authorization', label: 'Authorization', description: 'Ensure proper access controls' },
    {
      id: 'data-validation',
      label: 'Data Validation',
      description: 'Check input sanitization and validation',
    },
    {
      id: 'sensitive-data-exposure',
      label: 'Sensitive Data',
      description: 'Look for exposed secrets or sensitive information',
    },
    { id: 'csrf', label: 'CSRF', description: 'Verify CSRF protection is in place' },
    { id: 'file-upload', label: 'File Upload', description: 'Check for insecure file handling' },
    { id: 'encryption', label: 'Encryption', description: 'Verify data is properly encrypted' },
    { id: 'logging', label: 'Logging', description: 'Ensure security events are logged' },
    {
      id: 'input-sanitization',
      label: 'Input Sanitization',
      description: 'Validate and sanitize all user inputs',
    },
    {
      id: 'access-control',
      label: 'Access Control',
      description: 'Verify role-based access restrictions',
    },
  ];

  const toggleChecklistItem = (item: string) => {
    const checklist = securityConfig.checklist || [];
    const newChecklist = checklist.includes(item)
      ? checklist.filter((i) => i !== item)
      : [...checklist, item];
    updateConfig({ checklist: newChecklist });
  };

  const severityLevels = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium">Security Checklist</Label>
        <p className="text-sm text-muted-foreground mb-3">Select security aspects to check for</p>

        <div className="grid grid-cols-2 gap-2">
          {checklistItems.map((item) => (
            <Badge
              key={item.id}
              variant={securityConfig.checklist?.includes(item.id) ? 'default' : 'outline'}
              className="cursor-pointer justify-center py-2"
              onClick={() => toggleChecklistItem(item.id)}
            >
              {item.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="severity">Minimum Severity</Label>
          <Select
            value={securityConfig.severity || 'medium'}
            onValueChange={(value: any) => updateConfig({ severity: value })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {severityLevels.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Only report issues at or above this severity
          </p>
        </div>

        <div className="flex items-center space-x-2 mt-6">
          <Switch
            checked={securityConfig.excludeTests ?? true}
            onCheckedChange={(checked) => updateConfig({ excludeTests: checked })}
          />
          <Label>Exclude Test Files</Label>
        </div>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">Security Check Descriptions</h4>
        <div className="text-sm space-y-1">
          {checklistItems.map((item) => {
            const isSelected = securityConfig.checklist?.includes(item.id);
            return (
              <div
                key={item.id}
                className={isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}
              >
                <strong>{item.label}:</strong> {item.description}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
