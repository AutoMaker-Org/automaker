import { useMemo } from 'react';
import {
  xmlToSpec,
  isValidSpecXml,
  type ParseResult,
  type SpecOutput,
} from '@automaker/spec-parser';

/**
 * Result of the spec parsing hook.
 */
export interface UseSpecParserResult {
  /** Whether the XML is valid */
  isValid: boolean;
  /** The parsed spec object, or null if parsing failed */
  parsedSpec: SpecOutput | null;
  /** Parsing errors, if any */
  errors: string[];
  /** The full parse result */
  parseResult: ParseResult | null;
}

/**
 * Hook to parse XML spec content into a SpecOutput object.
 * Memoizes the parsing result to avoid unnecessary re-parsing.
 *
 * @param xmlContent - The raw XML content from app_spec.txt
 * @returns Parsed spec data with validation status
 */
export function useSpecParser(xmlContent: string): UseSpecParserResult {
  return useMemo(() => {
    if (!xmlContent || !xmlContent.trim()) {
      return {
        isValid: false,
        parsedSpec: null,
        errors: ['No spec content provided'],
        parseResult: null,
      };
    }

    // Quick structure check first
    if (!isValidSpecXml(xmlContent)) {
      return {
        isValid: false,
        parsedSpec: null,
        errors: ['Invalid XML structure - missing required elements'],
        parseResult: null,
      };
    }

    // Full parse
    const parseResult = xmlToSpec(xmlContent);

    return {
      isValid: parseResult.success,
      parsedSpec: parseResult.spec,
      errors: parseResult.errors,
      parseResult,
    };
  }, [xmlContent]);
}
