import React, { useState } from 'react';
import axios from 'axios';
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
import { contactsService } from '@/services/api';
import { readData } from '@/services/response';
import { toast } from 'sonner';

/** The created contact (ContactResponse in internal/handlers/contacts.go). */
export interface CreatedContact {
  id: string;
  phone_number: string;
  profile_name: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (newContact: CreatedContact) => void;
}

export const CreateContactDialog: React.FC<CreateContactDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      toast.error('Phone number is required');
      return;
    }
    // WhatsApp numbers are stored as digits only; the API strips just a leading
    // '+', so drop formatting such as spaces, dashes and brackets here.
    const phone = phoneNumber.trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d+$/.test(phone)) {
      toast.error('Phone number may only contain digits and a leading +');
      return;
    }

    setIsSubmitting(true);
    try {
      const tagList = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))];
      const name = `${firstName.trim()} ${lastName.trim()}`.trim();
      // CreateContactRequest: phone_number, profile_name, tags, metadata.
      // Contacts have no email field, so it is kept in metadata.
      const res = await contactsService.create({
        phone_number: phone,
        profile_name: name || undefined,
        tags: tagList,
        metadata: email.trim() ? { email: email.trim() } : undefined,
      });

      toast.success('Contact created successfully');
      setPhoneNumber('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setTags('');
      onOpenChange(false);
      if (onCreated) onCreated(readData<CreatedContact>(res));
    } catch (err) {
      const message =
        axios.isAxiosError(err) && (err.response?.data as { message?: string } | undefined)?.message;
      toast.error(message || 'Failed to create contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>
              Create a new contact in your WhatsApp business directory.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Phone Number (with Country Code) *</Label>
              <Input
                id="phone"
                placeholder="+1 (555) 000-0000"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="VIP, Lead, Support"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
