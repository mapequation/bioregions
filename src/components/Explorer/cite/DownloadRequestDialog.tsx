import { Alert, Box, Button, Flex, Input, Link, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import { LuLock } from 'react-icons/lu';
import { isAbortError, type OccurrenceQuery, queryTitle } from '@/sources';
import { useStore } from '../../../store';
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { Field } from '../../ui/field';
import { isValidEmail, requestError } from './citeHelpers';
import { primaryButtonProps } from '../buttonStyles';

export const LOGIN_NOTE = 'Your GBIF password is sent only to api.gbif.org and is never stored.';

const REMEMBER_KEY = 'bioregions.explorer.gbifUser';

function readRemembered(): { user: string; email: string } {
  try {
    const v = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null');
    if (v && typeof v.user === 'string' && typeof v.email === 'string') return v;
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return { user: '', email: '' };
}

function remember(user: string, email: string) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ user, email }));
  } catch {
    // Not essential.
  }
}

export interface DownloadRequestDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The query to request; defaults to the loaded dataset's query, else the current one. */
  query?: OccurrenceQuery;
}

/** Credentials dialog for a citable GBIF download (flow 5). The password lives only in this component's state. */
export default observer(function DownloadRequestDialog({ open, onOpenChange, query }: DownloadRequestDialogProps) {
  const { explorerStore } = useStore();
  const q = query ?? explorerStore.loaded?.query ?? explorerStore.query;
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: 'password' } | null>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // Forget the password as soon as the dialog closes.
      setPassword('');
      setError(null);
      setBusy(false);
      return;
    }
    const r = readRemembered();
    setUser((u) => u || r.user);
    setEmail((e) => e || r.email);
  }, [open]);

  const emailOk = isValidEmail(email);
  const valid = user.trim() !== '' && password !== '' && emailOk;
  const emailInvalid = emailTouched && email.trim() !== '' && !emailOk;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const fail = (e: { text: string; field?: 'password' }) => {
      setError(e);
      if (e.field === 'password') {
        setPassword('');
        requestAnimationFrame(() => passwordRef.current?.focus());
      }
    };
    try {
      await explorerStore.requestDownload({ user: user.trim(), password, email: email.trim() });
      const r = explorerStore.downloadRequest;
      if (r.state === 'error') {
        fail(requestError(r.error ?? 'GBIF did not accept the request.'));
        return;
      }
      remember(user.trim(), email.trim());
      setPassword('');
      onOpenChange(false);
    } catch (err) {
      if (isAbortError(err)) return;
      fail(requestError(err instanceof Error ? err.message : 'The request failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      size="sm"
      placement="center"
      initialFocusEl={() => (user ? passwordRef.current : userRef.current)}
      closeOnInteractOutside={!busy}
    >
      <DialogContent data-testid="download-dialog">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <DialogHeader pb={2}>
            <DialogTitle fontSize="md">Request a citable GBIF download</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger disabled={busy} />
          <DialogBody pb={2}>
            <DialogDescription fontSize="sm" color="fg.muted" mb={4}>
              GBIF prepares the records matching{' '}
              <Text as="span" color="fg" fontWeight="medium">
                {queryTitle(q) || 'this query'}
              </Text>{' '}
              as a zip with its own DOI, usually in 5–60 minutes. Needs a free{' '}
              <Link href="https://www.gbif.org/user/profile" target="_blank" rel="noopener noreferrer">
                GBIF.org account
              </Link>
              .
            </DialogDescription>
            <Stack gap={3.5}>
              <Field label="GBIF username" required>
                <Input
                  ref={userRef}
                  size="sm"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Password" required invalid={error?.field === 'password'}>
                <Input
                  ref={passwordRef}
                  size="sm"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field
                label="Notification email"
                required
                invalid={emailInvalid}
                errorText="Enter an email address like name@example.org."
                helperText={emailInvalid ? undefined : 'GBIF emails you when the zip is ready.'}
              >
                <Input
                  ref={emailRef}
                  size="sm"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  disabled={busy}
                />
              </Field>
              <Flex gap={2} align="flex-start" fontSize="xs" color="fg.muted" bg="bg.subtle" rounded="md" px={3} py={2}>
                <Box as={LuLock} flexShrink={0} mt="2px" aria-hidden />
                <Text>{LOGIN_NOTE}</Text>
              </Flex>
              {error && (
                <Alert.Root status="error" size="sm" variant="subtle" role="alert">
                  <Alert.Indicator />
                  <Alert.Title fontWeight="normal">{error.text}</Alert.Title>
                </Alert.Root>
              )}
            </Stack>
          </DialogBody>
          <DialogFooter pt={3}>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button {...primaryButtonProps} type="submit" disabled={!valid} loading={busy} loadingText="Requesting…">
              Request download
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
});
