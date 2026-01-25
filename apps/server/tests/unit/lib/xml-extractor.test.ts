import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeXml,
  unescapeXml,
  extractXmlSection,
  extractXmlElements,
  extractImplementedFeatures,
  extractImplementedFeatureNames,
  featureToXml,
  featuresToXml,
  updateImplementedFeaturesSection,
  addImplementedFeature,
  removeImplementedFeature,
  updateImplementedFeature,
  hasImplementedFeature,
  toSpecOutputFeatures,
  fromSpecOutputFeatures,
  type ImplementedFeature,
  type XmlExtractorLogger,
} from '@/lib/xml-extractor.js';

describe('xml-extractor.ts', () => {
  // Mock logger for testing custom logger functionality
  const createMockLogger = (): XmlExtractorLogger & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      debug: vi.fn((msg: string) => calls.push(`debug: ${msg}`)),
      warn: vi.fn((msg: string) => calls.push(`warn: ${msg}`)),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('escapeXml', () => {
    it('should escape ampersand', () => {
      expect(escapeXml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeXml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(escapeXml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeXml("it's" + ' fine')).toBe('it&apos;s fine');
    });

    it('should handle null', () => {
      expect(escapeXml(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(escapeXml(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(escapeXml('')).toBe('');
    });

    it('should escape multiple special characters', () => {
      expect(escapeXml('a < b & c > d "e" \'f\'')).toBe(
        'a &lt; b &amp; c &gt; d &quot;e&quot; &apos;f&apos;'
      );
    });
  });

  describe('unescapeXml', () => {
    it('should unescape ampersand', () => {
      expect(unescapeXml('foo &amp; bar')).toBe('foo & bar');
    });

    it('should unescape less than', () => {
      expect(unescapeXml('a &lt; b')).toBe('a < b');
    });

    it('should unescape greater than', () => {
      expect(unescapeXml('a &gt; b')).toBe('a > b');
    });

    it('should unescape double quotes', () => {
      expect(unescapeXml('say &quot;hello&quot;')).toBe('say "hello"');
    });

    it('should unescape single quotes', () => {
      expect(unescapeXml('it&apos;s fine')).toBe("it's fine");
    });

    it('should handle empty string', () => {
      expect(unescapeXml('')).toBe('');
    });

    it('should roundtrip with escapeXml', () => {
      const original = 'Test & <value> "quoted" \'apostrophe\'';
      expect(unescapeXml(escapeXml(original))).toBe(original);
    });
  });

  describe('extractXmlSection', () => {
    it('should extract section content', () => {
      const xml = '<root><section>content here</section></root>';
      expect(extractXmlSection(xml, 'section')).toBe('content here');
    });

    it('should extract multiline section content', () => {
      const xml = `<root>
<section>
  line 1
  line 2
</section>
</root>`;
      expect(extractXmlSection(xml, 'section')).toContain('line 1');
      expect(extractXmlSection(xml, 'section')).toContain('line 2');
    });

    it('should return null for non-existent section', () => {
      const xml = '<root><other>content</other></root>';
      expect(extractXmlSection(xml, 'section')).toBeNull();
    });

    it('should be case-insensitive', () => {
      const xml = '<root><Section>content</Section></root>';
      expect(extractXmlSection(xml, 'section')).toBe('content');
    });

    it('should handle empty section', () => {
      const xml = '<root><section></section></root>';
      expect(extractXmlSection(xml, 'section')).toBe('');
    });
  });

  describe('extractXmlElements', () => {
    it('should extract all element values', () => {
      const xml = '<items><item>one</item><item>two</item><item>three</item></items>';
      expect(extractXmlElements(xml, 'item')).toEqual(['one', 'two', 'three']);
    });

    it('should return empty array for non-existent elements', () => {
      const xml = '<items><other>value</other></items>';
      expect(extractXmlElements(xml, 'item')).toEqual([]);
    });

    it('should trim whitespace', () => {
      const xml = '<items><item>  spaced  </item></items>';
      expect(extractXmlElements(xml, 'item')).toEqual(['spaced']);
    });

    it('should unescape XML entities', () => {
      const xml = '<items><item>foo &amp; bar</item></items>';
      expect(extractXmlElements(xml, 'item')).toEqual(['foo & bar']);
    });

    it('should handle empty elements', () => {
      const xml = '<items><item></item><item>value</item></items>';
      expect(extractXmlElements(xml, 'item')).toEqual(['', 'value']);
    });
  });

  describe('extractImplementedFeatures', () => {
    const sampleSpec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test Project</project_name>
  <implemented_features>
    <feature>
      <name>Feature One</name>
      <description>First feature description</description>
    </feature>
    <feature>
      <name>Feature Two</name>
      <description>Second feature description</description>
      <file_locations>
        <location>src/feature-two.ts</location>
        <location>src/utils/helper.ts</location>
      </file_locations>
    </feature>
  </implemented_features>
</project_specification>`;

    it('should extract all features', () => {
      const features = extractImplementedFeatures(sampleSpec);
      expect(features).toHaveLength(2);
    });

    it('should extract feature names', () => {
      const features = extractImplementedFeatures(sampleSpec);
      expect(features[0].name).toBe('Feature One');
      expect(features[1].name).toBe('Feature Two');
    });

    it('should extract feature descriptions', () => {
      const features = extractImplementedFeatures(sampleSpec);
      expect(features[0].description).toBe('First feature description');
      expect(features[1].description).toBe('Second feature description');
    });

    it('should extract file_locations when present', () => {
      const features = extractImplementedFeatures(sampleSpec);
      expect(features[0].file_locations).toBeUndefined();
      expect(features[1].file_locations).toEqual(['src/feature-two.ts', 'src/utils/helper.ts']);
    });

    it('should return empty array for missing section', () => {
      const xml =
        '<project_specification><project_name>Test</project_name></project_specification>';
      expect(extractImplementedFeatures(xml)).toEqual([]);
    });

    it('should return empty array for empty section', () => {
      const xml = `<project_specification>
        <implemented_features>
        </implemented_features>
      </project_specification>`;
      expect(extractImplementedFeatures(xml)).toEqual([]);
    });

    it('should handle escaped content', () => {
      const xml = `<implemented_features>
        <feature>
          <name>Test &amp; Feature</name>
          <description>Uses &lt;brackets&gt;</description>
        </feature>
      </implemented_features>`;
      const features = extractImplementedFeatures(xml);
      expect(features[0].name).toBe('Test & Feature');
      expect(features[0].description).toBe('Uses <brackets>');
    });
  });

  describe('extractImplementedFeatureNames', () => {
    it('should return only feature names', () => {
      const xml = `<implemented_features>
        <feature>
          <name>Feature A</name>
          <description>Description A</description>
        </feature>
        <feature>
          <name>Feature B</name>
          <description>Description B</description>
        </feature>
      </implemented_features>`;
      expect(extractImplementedFeatureNames(xml)).toEqual(['Feature A', 'Feature B']);
    });

    it('should return empty array for no features', () => {
      const xml = '<root></root>';
      expect(extractImplementedFeatureNames(xml)).toEqual([]);
    });
  });

  describe('featureToXml', () => {
    it('should generate XML for feature without file_locations', () => {
      const feature: ImplementedFeature = {
        name: 'My Feature',
        description: 'Feature description',
      };
      const xml = featureToXml(feature);
      expect(xml).toContain('<name>My Feature</name>');
      expect(xml).toContain('<description>Feature description</description>');
      expect(xml).not.toContain('<file_locations>');
    });

    it('should generate XML for feature with file_locations', () => {
      const feature: ImplementedFeature = {
        name: 'My Feature',
        description: 'Feature description',
        file_locations: ['src/index.ts', 'src/utils.ts'],
      };
      const xml = featureToXml(feature);
      expect(xml).toContain('<file_locations>');
      expect(xml).toContain('<location>src/index.ts</location>');
      expect(xml).toContain('<location>src/utils.ts</location>');
    });

    it('should escape special characters', () => {
      const feature: ImplementedFeature = {
        name: 'Test & Feature',
        description: 'Has <tags>',
      };
      const xml = featureToXml(feature);
      expect(xml).toContain('Test &amp; Feature');
      expect(xml).toContain('Has &lt;tags&gt;');
    });

    it('should not include empty file_locations array', () => {
      const feature: ImplementedFeature = {
        name: 'Feature',
        description: 'Desc',
        file_locations: [],
      };
      const xml = featureToXml(feature);
      expect(xml).not.toContain('<file_locations>');
    });
  });

  describe('featuresToXml', () => {
    it('should generate XML for multiple features', () => {
      const features: ImplementedFeature[] = [
        { name: 'Feature 1', description: 'Desc 1' },
        { name: 'Feature 2', description: 'Desc 2' },
      ];
      const xml = featuresToXml(features);
      expect(xml).toContain('<name>Feature 1</name>');
      expect(xml).toContain('<name>Feature 2</name>');
    });

    it('should handle empty array', () => {
      expect(featuresToXml([])).toBe('');
    });
  });

  describe('updateImplementedFeaturesSection', () => {
    const baseSpec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
  <implemented_features>
    <feature>
      <name>Old Feature</name>
      <description>Old description</description>
    </feature>
  </implemented_features>
</project_specification>`;

    it('should replace existing section', () => {
      const newFeatures: ImplementedFeature[] = [
        { name: 'New Feature', description: 'New description' },
      ];
      const result = updateImplementedFeaturesSection(baseSpec, newFeatures);
      expect(result).toContain('New Feature');
      expect(result).not.toContain('Old Feature');
    });

    it('should insert section after core_capabilities if missing', () => {
      const specWithoutSection = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
</project_specification>`;
      const newFeatures: ImplementedFeature[] = [
        { name: 'New Feature', description: 'New description' },
      ];
      const result = updateImplementedFeaturesSection(specWithoutSection, newFeatures);
      expect(result).toContain('<implemented_features>');
      expect(result).toContain('New Feature');
    });

    it('should handle multiple features', () => {
      const newFeatures: ImplementedFeature[] = [
        { name: 'Feature A', description: 'Desc A' },
        { name: 'Feature B', description: 'Desc B', file_locations: ['src/b.ts'] },
      ];
      const result = updateImplementedFeaturesSection(baseSpec, newFeatures);
      expect(result).toContain('Feature A');
      expect(result).toContain('Feature B');
      expect(result).toContain('src/b.ts');
    });
  });

  describe('addImplementedFeature', () => {
    const baseSpec = `<implemented_features>
    <feature>
      <name>Existing Feature</name>
      <description>Existing description</description>
    </feature>
  </implemented_features>`;

    it('should add new feature', () => {
      const newFeature: ImplementedFeature = {
        name: 'New Feature',
        description: 'New description',
      };
      const result = addImplementedFeature(baseSpec, newFeature);
      expect(result).toContain('Existing Feature');
      expect(result).toContain('New Feature');
    });

    it('should not add duplicate feature', () => {
      const duplicate: ImplementedFeature = {
        name: 'Existing Feature',
        description: 'Different description',
      };
      const result = addImplementedFeature(baseSpec, duplicate);
      // Should still have only one instance
      const matches = result.match(/Existing Feature/g);
      expect(matches).toHaveLength(1);
    });

    it('should be case-insensitive for duplicates', () => {
      const duplicate: ImplementedFeature = {
        name: 'EXISTING FEATURE',
        description: 'Different description',
      };
      const result = addImplementedFeature(baseSpec, duplicate);
      expect(result).not.toContain('EXISTING FEATURE');
    });
  });

  describe('removeImplementedFeature', () => {
    const baseSpec = `<implemented_features>
    <feature>
      <name>Feature A</name>
      <description>Description A</description>
    </feature>
    <feature>
      <name>Feature B</name>
      <description>Description B</description>
    </feature>
  </implemented_features>`;

    it('should remove feature by name', () => {
      const result = removeImplementedFeature(baseSpec, 'Feature A');
      expect(result).not.toContain('Feature A');
      expect(result).toContain('Feature B');
    });

    it('should be case-insensitive', () => {
      const result = removeImplementedFeature(baseSpec, 'feature a');
      expect(result).not.toContain('Feature A');
      expect(result).toContain('Feature B');
    });

    it('should return unchanged content if feature not found', () => {
      const result = removeImplementedFeature(baseSpec, 'Nonexistent');
      expect(result).toContain('Feature A');
      expect(result).toContain('Feature B');
    });
  });

  describe('updateImplementedFeature', () => {
    const baseSpec = `<implemented_features>
    <feature>
      <name>My Feature</name>
      <description>Original description</description>
    </feature>
  </implemented_features>`;

    it('should update feature description', () => {
      const result = updateImplementedFeature(baseSpec, 'My Feature', {
        description: 'Updated description',
      });
      expect(result).toContain('Updated description');
      expect(result).not.toContain('Original description');
    });

    it('should add file_locations', () => {
      const result = updateImplementedFeature(baseSpec, 'My Feature', {
        file_locations: ['src/new.ts'],
      });
      expect(result).toContain('<file_locations>');
      expect(result).toContain('src/new.ts');
    });

    it('should preserve feature name if not updated', () => {
      const result = updateImplementedFeature(baseSpec, 'My Feature', {
        description: 'New desc',
      });
      expect(result).toContain('My Feature');
    });

    it('should be case-insensitive', () => {
      const result = updateImplementedFeature(baseSpec, 'my feature', {
        description: 'Updated',
      });
      expect(result).toContain('Updated');
    });

    it('should return unchanged content if feature not found', () => {
      const result = updateImplementedFeature(baseSpec, 'Nonexistent', {
        description: 'New',
      });
      expect(result).toContain('Original description');
    });
  });

  describe('hasImplementedFeature', () => {
    const baseSpec = `<implemented_features>
    <feature>
      <name>Existing Feature</name>
      <description>Description</description>
    </feature>
  </implemented_features>`;

    it('should return true for existing feature', () => {
      expect(hasImplementedFeature(baseSpec, 'Existing Feature')).toBe(true);
    });

    it('should return false for non-existing feature', () => {
      expect(hasImplementedFeature(baseSpec, 'Nonexistent')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(hasImplementedFeature(baseSpec, 'existing feature')).toBe(true);
      expect(hasImplementedFeature(baseSpec, 'EXISTING FEATURE')).toBe(true);
    });
  });

  describe('toSpecOutputFeatures', () => {
    it('should convert to SpecOutput format', () => {
      const features: ImplementedFeature[] = [
        { name: 'Feature 1', description: 'Desc 1' },
        { name: 'Feature 2', description: 'Desc 2', file_locations: ['src/f2.ts'] },
      ];
      const result = toSpecOutputFeatures(features);
      expect(result).toEqual([
        { name: 'Feature 1', description: 'Desc 1' },
        { name: 'Feature 2', description: 'Desc 2', file_locations: ['src/f2.ts'] },
      ]);
    });

    it('should handle empty array', () => {
      expect(toSpecOutputFeatures([])).toEqual([]);
    });
  });

  describe('fromSpecOutputFeatures', () => {
    it('should convert from SpecOutput format', () => {
      const specFeatures = [
        { name: 'Feature 1', description: 'Desc 1' },
        { name: 'Feature 2', description: 'Desc 2', file_locations: ['src/f2.ts'] },
      ];
      const result = fromSpecOutputFeatures(specFeatures);
      expect(result).toEqual([
        { name: 'Feature 1', description: 'Desc 1' },
        { name: 'Feature 2', description: 'Desc 2', file_locations: ['src/f2.ts'] },
      ]);
    });

    it('should handle empty array', () => {
      expect(fromSpecOutputFeatures([])).toEqual([]);
    });
  });

  describe('roundtrip', () => {
    it('should maintain data integrity through extract -> update cycle', () => {
      const originalSpec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
  <implemented_features>
    <feature>
      <name>Test &amp; Feature</name>
      <description>Uses &lt;special&gt; chars</description>
      <file_locations>
        <location>src/test.ts</location>
      </file_locations>
    </feature>
  </implemented_features>
</project_specification>`;

      // Extract features
      const features = extractImplementedFeatures(originalSpec);
      expect(features[0].name).toBe('Test & Feature');
      expect(features[0].description).toBe('Uses <special> chars');

      // Update with same features
      const result = updateImplementedFeaturesSection(originalSpec, features);

      // Re-extract and verify
      const reExtracted = extractImplementedFeatures(result);
      expect(reExtracted[0].name).toBe('Test & Feature');
      expect(reExtracted[0].description).toBe('Uses <special> chars');
      expect(reExtracted[0].file_locations).toEqual(['src/test.ts']);
    });
  });

  describe('custom logger', () => {
    it('should use custom logger for extractXmlSection', () => {
      const mockLogger = createMockLogger();
      const xml = '<root><section>content</section></root>';
      extractXmlSection(xml, 'section', { logger: mockLogger });
      expect(mockLogger.debug).toHaveBeenCalledWith('Extracted <section> section');
    });

    it('should log when section is not found', () => {
      const mockLogger = createMockLogger();
      const xml = '<root><other>content</other></root>';
      extractXmlSection(xml, 'missing', { logger: mockLogger });
      expect(mockLogger.debug).toHaveBeenCalledWith('Section <missing> not found');
    });

    it('should use custom logger for extractXmlElements', () => {
      const mockLogger = createMockLogger();
      const xml = '<items><item>one</item><item>two</item></items>';
      extractXmlElements(xml, 'item', { logger: mockLogger });
      expect(mockLogger.debug).toHaveBeenCalledWith('Extracted 2 <item> elements');
    });

    it('should use custom logger for extractImplementedFeatures', () => {
      const mockLogger = createMockLogger();
      const xml = `<implemented_features>
        <feature>
          <name>Test</name>
          <description>Desc</description>
        </feature>
      </implemented_features>`;
      extractImplementedFeatures(xml, { logger: mockLogger });
      expect(mockLogger.debug).toHaveBeenCalledWith('Extracted 1 implemented features');
    });

    it('should log when no implemented_features section found', () => {
      const mockLogger = createMockLogger();
      const xml = '<root><other>content</other></root>';
      extractImplementedFeatures(xml, { logger: mockLogger });
      expect(mockLogger.debug).toHaveBeenCalledWith('No implemented_features section found');
    });

    it('should use custom logger warn for missing insertion point', () => {
      const mockLogger = createMockLogger();
      // XML without project_specification, core_capabilities, or implemented_features
      const xml = '<other>content</other>';
      const features: ImplementedFeature[] = [{ name: 'Test', description: 'Desc' }];
      updateImplementedFeaturesSection(xml, features, { logger: mockLogger });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not find appropriate insertion point for implemented_features'
      );
    });
  });

  describe('edge cases', () => {
    describe('escapeXml edge cases', () => {
      it('should handle strings with only special characters', () => {
        expect(escapeXml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&apos;');
      });

      it('should handle very long strings', () => {
        const longString = 'a'.repeat(10000) + '&' + 'b'.repeat(10000);
        const escaped = escapeXml(longString);
        expect(escaped).toContain('&amp;');
        expect(escaped.length).toBe(20005); // +4 for &amp; minus &
      });

      it('should handle unicode characters without escaping', () => {
        const unicode = '日本語 emoji: 🚀 symbols: ∞ ≠ ≤';
        expect(escapeXml(unicode)).toBe(unicode);
      });
    });

    describe('unescapeXml edge cases', () => {
      it('should handle strings with only entities', () => {
        expect(unescapeXml('&lt;&gt;&amp;&quot;&apos;')).toBe('<>&"\'');
      });

      it('should not double-unescape', () => {
        // &amp;lt; should become &lt; (not <)
        expect(unescapeXml('&amp;lt;')).toBe('&lt;');
      });

      it('should handle partial/invalid entities gracefully', () => {
        // Invalid entities should pass through unchanged
        expect(unescapeXml('&unknown;')).toBe('&unknown;');
        expect(unescapeXml('&amp')).toBe('&amp'); // Missing semicolon
      });
    });

    describe('extractXmlSection edge cases', () => {
      it('should handle nested tags with same name', () => {
        // Note: regex-based parsing with non-greedy matching will match
        // from first opening tag to first closing tag
        const xml = '<outer><outer>inner</outer></outer>';
        // Non-greedy [\s\S]*? matches from first <outer> to first </outer>
        expect(extractXmlSection(xml, 'outer')).toBe('<outer>inner');
      });

      it('should handle self-closing tags (returns null)', () => {
        const xml = '<root><section /></root>';
        // Regex expects content between tags, self-closing won't match
        expect(extractXmlSection(xml, 'section')).toBeNull();
      });

      it('should handle tags with attributes', () => {
        const xml = '<root><section id="1" class="test">content</section></root>';
        // The regex matches exact tag names, so this won't match
        expect(extractXmlSection(xml, 'section')).toBeNull();
      });

      it('should handle whitespace in tag content', () => {
        const xml = '<section>   \n\t  </section>';
        expect(extractXmlSection(xml, 'section')).toBe('   \n\t  ');
      });
    });

    describe('extractXmlElements edge cases', () => {
      it('should handle elements across multiple lines', () => {
        const xml = `<items>
          <item>
            first
          </item>
          <item>second</item>
        </items>`;
        // Multiline content is now captured with [\s\S]*? pattern
        const result = extractXmlElements(xml, 'item');
        expect(result).toHaveLength(2);
        expect(result[0]).toBe('first');
        expect(result[1]).toBe('second');
      });

      it('should handle consecutive elements without whitespace', () => {
        const xml = '<items><item>a</item><item>b</item><item>c</item></items>';
        expect(extractXmlElements(xml, 'item')).toEqual(['a', 'b', 'c']);
      });
    });

    describe('extractImplementedFeatures edge cases', () => {
      it('should skip features without names', () => {
        const xml = `<implemented_features>
          <feature>
            <description>Orphan description</description>
          </feature>
          <feature>
            <name>Valid Feature</name>
            <description>Has name</description>
          </feature>
        </implemented_features>`;
        const features = extractImplementedFeatures(xml);
        expect(features).toHaveLength(1);
        expect(features[0].name).toBe('Valid Feature');
      });

      it('should handle features with empty names', () => {
        const xml = `<implemented_features>
          <feature>
            <name></name>
            <description>Empty name</description>
          </feature>
        </implemented_features>`;
        const features = extractImplementedFeatures(xml);
        expect(features).toHaveLength(0); // Empty name is falsy
      });

      it('should handle features with whitespace-only names', () => {
        const xml = `<implemented_features>
          <feature>
            <name>   </name>
            <description>Whitespace name</description>
          </feature>
        </implemented_features>`;
        const features = extractImplementedFeatures(xml);
        expect(features).toHaveLength(0); // Trimmed whitespace is empty
      });

      it('should handle empty file_locations section', () => {
        const xml = `<implemented_features>
          <feature>
            <name>Test</name>
            <description>Desc</description>
            <file_locations>
            </file_locations>
          </feature>
        </implemented_features>`;
        const features = extractImplementedFeatures(xml);
        expect(features[0].file_locations).toBeUndefined();
      });
    });

    describe('featureToXml edge cases', () => {
      it('should handle custom indentation', () => {
        const feature: ImplementedFeature = {
          name: 'Test',
          description: 'Desc',
        };
        const xml = featureToXml(feature, '\t');
        expect(xml).toContain('\t\t<feature>');
        expect(xml).toContain('\t\t\t<name>Test</name>');
      });

      it('should handle empty description', () => {
        const feature: ImplementedFeature = {
          name: 'Test',
          description: '',
        };
        const xml = featureToXml(feature);
        expect(xml).toContain('<description></description>');
      });

      it('should handle undefined file_locations', () => {
        const feature: ImplementedFeature = {
          name: 'Test',
          description: 'Desc',
          file_locations: undefined,
        };
        const xml = featureToXml(feature);
        expect(xml).not.toContain('file_locations');
      });
    });

    describe('updateImplementedFeaturesSection edge cases', () => {
      it('should insert before </project_specification> as fallback', () => {
        const specWithoutCoreCapabilities = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test</project_name>
</project_specification>`;
        const newFeatures: ImplementedFeature[] = [
          { name: 'New Feature', description: 'New description' },
        ];
        const result = updateImplementedFeaturesSection(specWithoutCoreCapabilities, newFeatures);
        expect(result).toContain('<implemented_features>');
        expect(result).toContain('New Feature');
        expect(result.indexOf('<implemented_features>')).toBeLessThan(
          result.indexOf('</project_specification>')
        );
      });

      it('should return unchanged content when no insertion point found', () => {
        const invalidSpec = '<other>content</other>';
        const newFeatures: ImplementedFeature[] = [{ name: 'Feature', description: 'Desc' }];
        const result = updateImplementedFeaturesSection(invalidSpec, newFeatures);
        expect(result).toBe(invalidSpec);
      });

      it('should handle empty features array', () => {
        const spec = `<implemented_features>
          <feature>
            <name>Old</name>
            <description>Old desc</description>
          </feature>
        </implemented_features>`;
        const result = updateImplementedFeaturesSection(spec, []);
        expect(result).toContain('<implemented_features>');
        expect(result).not.toContain('Old');
      });
    });

    describe('addImplementedFeature edge cases', () => {
      it('should create section when adding to spec without implemented_features', () => {
        const specWithoutSection = `<project_specification>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
</project_specification>`;
        const newFeature: ImplementedFeature = {
          name: 'First Feature',
          description: 'First description',
        };
        const result = addImplementedFeature(specWithoutSection, newFeature);
        expect(result).toContain('<implemented_features>');
        expect(result).toContain('First Feature');
      });

      it('should handle feature with all fields populated', () => {
        const spec = `<implemented_features></implemented_features>`;
        const newFeature: ImplementedFeature = {
          name: 'Complete Feature',
          description: 'Full description',
          file_locations: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        };
        const result = addImplementedFeature(spec, newFeature);
        expect(result).toContain('Complete Feature');
        expect(result).toContain('src/a.ts');
        expect(result).toContain('src/b.ts');
        expect(result).toContain('src/c.ts');
      });
    });

    describe('updateImplementedFeature edge cases', () => {
      it('should allow updating feature name', () => {
        const spec = `<implemented_features>
          <feature>
            <name>Old Name</name>
            <description>Desc</description>
          </feature>
        </implemented_features>`;
        const result = updateImplementedFeature(spec, 'Old Name', {
          name: 'New Name',
        });
        expect(result).toContain('New Name');
        expect(result).not.toContain('Old Name');
      });

      it('should allow clearing file_locations', () => {
        const spec = `<implemented_features>
          <feature>
            <name>Test</name>
            <description>Desc</description>
            <file_locations>
              <location>src/old.ts</location>
            </file_locations>
          </feature>
        </implemented_features>`;
        const result = updateImplementedFeature(spec, 'Test', {
          file_locations: [],
        });
        expect(result).not.toContain('file_locations');
        expect(result).not.toContain('src/old.ts');
      });

      it('should handle updating multiple fields at once', () => {
        const spec = `<implemented_features>
          <feature>
            <name>Original</name>
            <description>Original desc</description>
          </feature>
        </implemented_features>`;
        const result = updateImplementedFeature(spec, 'Original', {
          name: 'Updated',
          description: 'Updated desc',
          file_locations: ['new/path.ts'],
        });
        expect(result).toContain('Updated');
        expect(result).toContain('Updated desc');
        expect(result).toContain('new/path.ts');
      });
    });

    describe('toSpecOutputFeatures and fromSpecOutputFeatures edge cases', () => {
      it('should handle features with empty file_locations array', () => {
        const features: ImplementedFeature[] = [
          { name: 'Test', description: 'Desc', file_locations: [] },
        ];
        const specOutput = toSpecOutputFeatures(features);
        expect(specOutput[0].file_locations).toBeUndefined();
      });

      it('should handle round-trip conversion', () => {
        const original: ImplementedFeature[] = [
          { name: 'Feature 1', description: 'Desc 1' },
          { name: 'Feature 2', description: 'Desc 2', file_locations: ['src/f.ts'] },
        ];
        const specOutput = toSpecOutputFeatures(original);
        const restored = fromSpecOutputFeatures(specOutput);
        expect(restored).toEqual(original);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle a complete spec file workflow', () => {
      // Start with a minimal spec
      let spec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>My App</project_name>
  <core_capabilities>
    <capability>User management</capability>
  </core_capabilities>
</project_specification>`;

      // Add first feature
      spec = addImplementedFeature(spec, {
        name: 'User Authentication',
        description: 'Login and logout functionality',
        file_locations: ['src/auth/login.ts', 'src/auth/logout.ts'],
      });
      expect(hasImplementedFeature(spec, 'User Authentication')).toBe(true);

      // Add second feature
      spec = addImplementedFeature(spec, {
        name: 'User Profile',
        description: 'View and edit user profile',
      });
      expect(extractImplementedFeatureNames(spec)).toEqual(['User Authentication', 'User Profile']);

      // Update first feature
      spec = updateImplementedFeature(spec, 'User Authentication', {
        file_locations: ['src/auth/login.ts', 'src/auth/logout.ts', 'src/auth/session.ts'],
      });
      const features = extractImplementedFeatures(spec);
      expect(features[0].file_locations).toContain('src/auth/session.ts');

      // Remove a feature
      spec = removeImplementedFeature(spec, 'User Profile');
      expect(hasImplementedFeature(spec, 'User Profile')).toBe(false);
      expect(hasImplementedFeature(spec, 'User Authentication')).toBe(true);
    });

    it('should handle special characters throughout workflow', () => {
      const spec = `<project_specification>
  <core_capabilities></core_capabilities>
</project_specification>`;

      const result = addImplementedFeature(spec, {
        name: 'Search & Filter',
        description: 'Supports <query> syntax with "quoted" terms',
        file_locations: ["src/search/parser's.ts"],
      });

      const features = extractImplementedFeatures(result);
      expect(features[0].name).toBe('Search & Filter');
      expect(features[0].description).toBe('Supports <query> syntax with "quoted" terms');
      expect(features[0].file_locations?.[0]).toBe("src/search/parser's.ts");
    });

    it('should preserve other XML content when modifying features', () => {
      const spec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Preserved Name</project_name>
  <description>This should be preserved</description>
  <core_capabilities>
    <capability>Capability 1</capability>
    <capability>Capability 2</capability>
  </core_capabilities>
  <implemented_features>
    <feature>
      <name>Old Feature</name>
      <description>Will be replaced</description>
    </feature>
  </implemented_features>
  <future_plans>Keep this too</future_plans>
</project_specification>`;

      const result = updateImplementedFeaturesSection(spec, [
        { name: 'New Feature', description: 'New desc' },
      ]);

      expect(result).toContain('Preserved Name');
      expect(result).toContain('This should be preserved');
      expect(result).toContain('Capability 1');
      expect(result).toContain('Capability 2');
      expect(result).toContain('Keep this too');
      expect(result).not.toContain('Old Feature');
      expect(result).toContain('New Feature');
    });
  });
});
