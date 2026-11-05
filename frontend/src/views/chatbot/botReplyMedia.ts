import { useEffect, useState } from 'react';
import { chatbotService } from '@/services/api';

/** Sample values the preview shows for the contact variables. */
const SAMPLE_VARIABLES: Record<string, string> = {
  first_name: 'Asha',
  last_name: 'Verma',
  full_name: 'Asha Verma',
  phone_number: '+91 98765 43210',
  email: 'asha@mail.com',
  country: 'India',
  language_code: 'en',
};

export const previewText = (s: string | undefined) =>
  (s ?? '').replace(/\{\{?\s*([a-z_]+)\s*\}?\}/g, (m, name: string) => SAMPLE_VARIABLES[name] ?? m);

/**
 * Object URL of an uploaded bot media file (fetched with the session's auth),
 * or of a local file just picked. Revoked when it changes.
 */
export function useBotMediaUrl(mediaPath: string | undefined, localFile?: File | null): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let revoked = false;
    let objectUrl = '';
    if (localFile) {
      objectUrl = URL.createObjectURL(localFile);
      setUrl(objectUrl);
    } else if (mediaPath) {
      const file = mediaPath.split('/').pop() || '';
      chatbotService
        .getFlowMedia(file)
        .then((res) => {
          if (revoked) return;
          objectUrl = URL.createObjectURL(res.data);
          setUrl(objectUrl);
        })
        .catch(() => !revoked && setUrl(''));
    } else {
      setUrl('');
    }
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaPath, localFile]);
  return url;
}

