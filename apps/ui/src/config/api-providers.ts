import type { Dispatch, SetStateAction } from 'react';
import type { ApiKeys } from '@/store/app-store';

export type ProviderKey = 'anthropic' | 'google' | 'elevenLabs';

export interface ProviderConfig {
  key: ProviderKey;
  label: string;
  inputId: string;
  placeholder: string;
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
  showValue: boolean;
  setShowValue: Dispatch<SetStateAction<boolean>>;
  hasStoredKey: string | null | undefined;
  inputTestId: string;
  toggleTestId: string;
  testButton: {
    onClick: () => Promise<void> | void;
    disabled: boolean;
    loading: boolean;
    testId: string;
  };
  result: { success: boolean; message: string } | null;
  resultTestId: string;
  resultMessageTestId: string;
  descriptionPrefix: string;
  descriptionLinkHref: string;
  descriptionLinkText: string;
  descriptionSuffix?: string;
}

export interface ProviderConfigParams {
  apiKeys: ApiKeys;
  anthropic: {
    value: string;
    setValue: Dispatch<SetStateAction<string>>;
    show: boolean;
    setShow: Dispatch<SetStateAction<boolean>>;
    testing: boolean;
    onTest: () => Promise<void>;
    result: { success: boolean; message: string } | null;
  };
  google: {
    value: string;
    setValue: Dispatch<SetStateAction<string>>;
    show: boolean;
    setShow: Dispatch<SetStateAction<boolean>>;
    testing: boolean;
    onTest: () => Promise<void>;
    result: { success: boolean; message: string } | null;
  };
  elevenLabs: {
    value: string;
    setValue: Dispatch<SetStateAction<string>>;
    show: boolean;
    setShow: Dispatch<SetStateAction<boolean>>;
  };
}

export const buildProviderConfigs = ({
  apiKeys,
  anthropic,
  elevenLabs,
}: ProviderConfigParams): ProviderConfig[] => [
  {
    key: 'anthropic',
    label: 'Anthropic API Key',
    inputId: 'anthropic-key',
    placeholder: 'sk-ant-...',
    value: anthropic.value,
    setValue: anthropic.setValue,
    showValue: anthropic.show,
    setShowValue: anthropic.setShow,
    hasStoredKey: apiKeys.anthropic,
    inputTestId: 'anthropic-api-key-input',
    toggleTestId: 'toggle-anthropic-visibility',
    testButton: {
      onClick: anthropic.onTest,
      disabled: !anthropic.value || anthropic.testing,
      loading: anthropic.testing,
      testId: 'test-claude-connection',
    },
    result: anthropic.result,
    resultTestId: 'test-connection-result',
    resultMessageTestId: 'test-connection-message',
    descriptionPrefix: 'Used for Claude AI features. Get your key at',
    descriptionLinkHref: 'https://console.anthropic.com/account/keys',
    descriptionLinkText: 'console.anthropic.com',
    descriptionSuffix: '.',
  },
  {
    key: 'elevenLabs',
    label: 'ElevenLabs API Key',
    inputId: 'elevenlabs-key',
    placeholder: 'sk_...',
    value: elevenLabs.value,
    setValue: elevenLabs.setValue,
    showValue: elevenLabs.show,
    setShowValue: elevenLabs.setShow,
    hasStoredKey: apiKeys.elevenLabs,
    inputTestId: 'elevenlabs-api-key-input',
    toggleTestId: 'toggle-elevenlabs-visibility',
    testButton: {
      onClick: async () => {},
      disabled: true,
      loading: false,
      testId: 'test-elevenlabs-connection',
    },
    result: null,
    resultTestId: 'elevenlabs-test-connection-result',
    resultMessageTestId: 'elevenlabs-test-connection-message',
    descriptionPrefix: 'Used for audio synopsis (Cmd+Y). Get your key at',
    descriptionLinkHref: 'https://elevenlabs.io/app/settings/api-keys',
    descriptionLinkText: 'elevenlabs.io',
    descriptionSuffix: '.',
  },
  // {
  //   key: "google",
  //   label: "Google API Key (Gemini)",
  //   inputId: "google-key",
  //   placeholder: "AIza...",
  //   value: google.value,
  //   setValue: google.setValue,
  //   showValue: google.show,
  //   setShowValue: google.setShow,
  //   hasStoredKey: apiKeys.google,
  //   inputTestId: "google-api-key-input",
  //   toggleTestId: "toggle-google-visibility",
  //   testButton: {
  //     onClick: google.onTest,
  //     disabled: !google.value || google.testing,
  //     loading: google.testing,
  //     testId: "test-gemini-connection",
  //   },
  //   result: google.result,
  //   resultTestId: "gemini-test-connection-result",
  //   resultMessageTestId: "gemini-test-connection-message",
  //   descriptionPrefix:
  //     "Used for Gemini AI features (including image/design prompts). Get your key at",
  //   descriptionLinkHref: "https://makersuite.google.com/app/apikey",
  //   descriptionLinkText: "makersuite.google.com",
  // },
];
