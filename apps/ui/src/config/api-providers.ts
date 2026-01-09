import type { Dispatch, SetStateAction } from 'react';
import type { ApiKeys } from '@/store/app-store';

export type ProviderKey = 'anthropic' | 'google' | 'openai';

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
  openai: {
    value: string;
    setValue: Dispatch<SetStateAction<string>>;
    show: boolean;
    setShow: Dispatch<SetStateAction<boolean>>;
    testing: boolean;
    onTest: () => Promise<void>;
    result: { success: boolean; message: string } | null;
  };
}

export const buildProviderConfigs = ({
  apiKeys,
  anthropic,
  openai,
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
    key: 'openai',
    label: 'OpenAI API Key',
    inputId: 'openai-key',
    placeholder: 'sk-...',
    value: openai.value,
    setValue: openai.setValue,
    showValue: openai.show,
    setShowValue: openai.setShow,
    hasStoredKey: apiKeys.openai,
    inputTestId: 'openai-api-key-input',
    toggleTestId: 'toggle-openai-visibility',
    testButton: {
      onClick: openai.onTest,
      disabled: !openai.value || openai.testing,
      loading: openai.testing,
      testId: 'test-openai-connection',
    },
    result: openai.result,
    resultTestId: 'openai-test-connection-result',
    resultMessageTestId: 'openai-test-connection-message',
    descriptionPrefix: 'Used for Codex and OpenAI features. Get your key at',
    descriptionLinkHref: 'https://platform.openai.com/api-keys',
    descriptionLinkText: 'platform.openai.com',
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
