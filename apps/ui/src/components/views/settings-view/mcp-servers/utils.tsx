import { Terminal, Globe, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { ServerType, ServerTestState } from './types';
import { SENSITIVE_PARAM_PATTERNS } from './constants';

/**
 * Mask sensitive values in URLs (query params with key-like names)
 */
export function maskSensitiveUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    let hasSensitive = false;

    for (const [key] of params.entries()) {
      if (SENSITIVE_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
        params.set(key, '***');
        hasSensitive = true;
      }
    }

    if (hasSensitive) {
      urlObj.search = params.toString();
      return urlObj.toString();
    }
    return url;
  } catch {
    // If URL parsing fails, try simple regex replacement for common patterns
    return url.replace(
      /([?&])(api[-_]?key|auth|token|secret|password|credential)=([^&]*)/gi,
      '$1$2=***'
    );
  }
}

export function getServerIcon(type: ServerType = 'stdio') {
  if (type === 'stdio') return Terminal;
  return Globe;
}

export function getTestStatusIcon(status: ServerTestState['status']) {
  switch (status) {
    case 'testing':
      return <Loader2 className="w-4 h-4 animate-spin text-brand-500" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-destructive" />;
    default:
      return null;
  }
}
