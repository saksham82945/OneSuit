import { describe, expect, it } from 'vitest';
import {
  isRichMessage,
  parseContactsContent,
  parseLocationContent,
  parseLocationInput,
  parseOrderContent,
  pollPercent,
} from './richUtils';

describe('parseLocationInput', () => {
  it('reads plain coordinates', () => {
    expect(parseLocationInput('28.6129, 77.2295')).toEqual({ latitude: 28.6129, longitude: 77.2295 });
    expect(parseLocationInput('-33.86 151.21')).toEqual({ latitude: -33.86, longitude: 151.21 });
  });

  it('reads Google Maps links', () => {
    expect(parseLocationInput('https://www.google.com/maps/place/India+Gate/@28.6129,77.2295,17z/data=x')).toEqual({
      latitude: 28.6129,
      longitude: 77.2295,
      name: 'India Gate',
    });
    expect(parseLocationInput('https://maps.google.com/?q=19.076,72.8777')).toEqual({ latitude: 19.076, longitude: 72.8777 });
    expect(parseLocationInput('https://www.google.com/maps/place/X/data=!3d12.97!4d77.59')).toEqual({ latitude: 12.97, longitude: 77.59 });
  });

  it('reads OpenStreetMap links', () => {
    expect(parseLocationInput('https://www.openstreetmap.org/?mlat=12.9&mlon=77.6#map=15/12.9/77.6')).toEqual({ latitude: 12.9, longitude: 77.6 });
    expect(parseLocationInput('https://www.openstreetmap.org/#map=15/12.9/77.6')).toEqual({ latitude: 12.9, longitude: 77.6 });
  });

  it('rejects text and out-of-range values', () => {
    expect(parseLocationInput('India Gate')).toBeNull();
    expect(parseLocationInput('95, 10')).toBeNull();
    expect(parseLocationInput('')).toBeNull();
  });
});

describe('stored content parsers', () => {
  it('parses location, contacts and orders', () => {
    expect(parseLocationContent({ body: '{"latitude":1,"longitude":2,"name":"A"}' })).toEqual({ latitude: 1, longitude: 2, name: 'A', address: undefined });
    expect(parseLocationContent({ body: 'hello' })).toBeNull();
    expect(parseContactsContent('[{"name":"Asha","phones":["+91 1"]}]')).toEqual([{ name: 'Asha', phones: ['+91 1'], emails: [], company: undefined }]);
    expect(parseOrderContent({ body: '{"items":[{"product_retailer_id":"a","quantity":2,"item_price":5}],"total":10}' })?.total).toBe(10);
  });

  it('knows which messages render as rich bubbles', () => {
    expect(isRichMessage({ message_type: 'location', content: { body: '{"latitude":1,"longitude":2}' } })).toBe(true);
    expect(isRichMessage({ message_type: 'interactive', interactive_data: { type: 'poll' } })).toBe(true);
    expect(isRichMessage({ message_type: 'interactive', interactive_data: { type: 'button' } })).toBe(false);
    expect(isRichMessage({ message_type: 'text', content: { body: 'hi' } })).toBe(false);
  });

  it('computes poll percentages', () => {
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(0, 0)).toBe(0);
  });
});
