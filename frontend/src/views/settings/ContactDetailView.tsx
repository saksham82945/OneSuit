import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { contactsService } from '@/services/api';
import { readData } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Phone, MessageSquare, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

// ContactResponse in internal/handlers/contacts.go
interface ContactDetail {
  id: string;
  phone_number?: string;
  profile_name?: string;
  name?: string;
  phone?: string;
  tags?: string[] | null;
  created_at?: string;
}

const getErrorMessage = (err: unknown, fallback: string) =>
  (axios.isAxiosError(err) && (err.response?.data as { message?: string } | undefined)?.message) ||
  fallback;

export const ContactDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Stay in whichever menu the user came from (Settings or Contacts).
  const contactsBase = useLocation().pathname.startsWith('/settings') ? '/settings/contacts' : '/contacts';
  const { hasPermission } = useAuthStore();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [profileName, setProfileName] = useState('');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const canWrite = hasPermission('contacts', 'write');
  const canDelete = hasPermission('contacts', 'delete');

  const applyContact = useCallback((data: ContactDetail) => {
    setContact(data);
    setProfileName(data.profile_name || data.name || '');
    setPhone(data.phone_number || data.phone || '');
    setTags(data.tags || []);
  }, []);

  const loadContact = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await contactsService.get(id);
      applyContact(readData<ContactDetail>(res));
    } catch (err) {
      setContact(null);
      toast.error(getErrorMessage(err, 'Failed to load contact details'));
    } finally {
      setIsLoading(false);
    }
  }, [id, applyContact]);

  useEffect(() => {
    loadContact();
  }, [loadContact]);

  const handleSave = async () => {
    if (!id || !contact) return;
    setIsSaving(true);
    try {
      // UpdateContactRequest: omitted fields are left unchanged. Only send the
      // name when it was edited, so a masked value is never written back.
      const originalName = contact.profile_name || contact.name || '';
      const res = await contactsService.update(id, {
        profile_name: profileName !== originalName ? profileName : undefined,
        tags,
      });
      toast.success('Contact saved successfully');
      const updated = readData<ContactDetail>(res);
      if (updated?.id) applyContact(updated);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save contact'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await contactsService.delete(id);
      toast.success('Contact deleted');
      navigate(contactsBase);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete contact'));
    } finally {
      setIsDeleting(false);
    }
  };

  const addTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTagInput('');
    }
  };

  const removeTag = (tToRemove: string) => {
    setTags(tags.filter((t) => t !== tToRemove));
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-white/50 light:text-gray-500">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <span>Loading contact details...</span>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
        <PageHeader
          title="Contact Detail"
          subtitle="View and update customer information"
          icon={Users}
          backLink={contactsBase}
        />
        <div className="flex-1 flex items-center justify-center p-8 text-sm text-white/50 light:text-gray-500">
          Contact not found, or you don't have access to it.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={profileName || phone || 'Contact Detail'}
        subtitle="View and update customer information"
        icon={Users}
        backLink={contactsBase}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/chat/${id}`)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              {t('contacts.openChat') || 'Open Chat'}
            </Button>
            {canWrite && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={isSaving}
                onClick={handleSave}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm text-white light:text-gray-900">{profileName || 'No Name Set'}</p>
                <p className="text-xs text-white/50 light:text-gray-500">{phone}</p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="profileName" className="text-xs">Profile Name</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                disabled={!canWrite}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="phone" className="text-xs">Phone Number</Label>
              <Input id="phone" value={phone} disabled className="opacity-70 cursor-not-allowed" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Tags</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
                {tags.map((tag) => (
                  <Badge key={tag} className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 flex items-center gap-1">
                    {tag}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-white light:hover:text-gray-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {tags.length === 0 && (
                  <span className="text-xs text-white/30 italic light:text-gray-400">No tags assigned</span>
                )}
              </div>
              {canWrite && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    placeholder="Add a new tag..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    className="h-8 text-xs max-w-xs"
                  />
                  <Button variant="outline" size="sm" onClick={addTag} className="h-8 text-xs">
                    Add Tag
                  </Button>
                </div>
              )}
            </div>

            <div className="pt-2 text-xs text-white/40 flex items-center justify-between border-t border-white/[0.06] light:text-gray-400 light:border-gray-200">
              <span>Created: {contact?.created_at ? new Date(contact.created_at).toLocaleString() : 'N/A'}</span>
              <span>ID: <code className="font-mono">{contact?.id}</code></span>
            </div>
          </CardContent>
        </Card>
      </div>

      <DeleteConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Contact"
        itemName={profileName || phone}
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};
export default ContactDetailView;
