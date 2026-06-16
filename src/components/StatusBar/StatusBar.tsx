import type { ReactNode } from 'react';
import { Box, chakra } from '@chakra-ui/react';
import { Tooltip } from '../ui/tooltip';

/** The bar container: a wrapping flex row that sits above a view. */
export function StatusBar({ children }: { children: ReactNode }) {
  return (
    <Box
      display="flex"
      alignItems="flex-start"
      flexWrap="wrap"
      gap={3}
      px={3}
      py={2}
      mb={2}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      boxShadow="xs"
      fontSize="11px"
      lineHeight="1.2"
    >
      {children}
    </Box>
  );
}

/** A thin vertical separator (used after the backend group). */
export function StatusDivider() {
  return <Box alignSelf="stretch" w="1px" bg="border" />;
}

/** A segmented control plus the small uppercase caption beneath it. */
export function StatusGroup({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap="5px">
      <Box
        display="flex"
        borderWidth="1px"
        borderColor="border"
        borderRadius="5px"
        overflow="hidden"
        css={{
          '& > button + button': { borderLeftWidth: '1px', borderColor: 'border' },
        }}
      >
        {children}
      </Box>
      <Box
        fontSize="9px"
        textTransform="uppercase"
        letterSpacing="0.05em"
        color="fg.subtle"
      >
        {caption}
      </Box>
    </Box>
  );
}

/** One uniform 34×34 cell. Text or a 24×24 icon child. Tooltip carries the help text. */
export function StatusButton({
  active = false,
  disabled = false,
  content,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  content: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={content} showArrow openDelay={250} closeDelay={50}>
      <chakra.button
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        w="34px"
        h="34px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flex="0 0 auto"
        fontWeight="600"
        bg={active ? 'blue.subtle' : 'bg.panel'}
        color={active ? 'blue.fg' : 'fg.muted'}
        boxShadow={active ? 'inset 0 -2px 0 var(--chakra-colors-blue-solid)' : undefined}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.4 : 1}
        transition="background 0.12s"
        _hover={{ bg: active ? 'blue.subtle' : 'bg.muted' }}
      >
        {children}
      </chakra.button>
    </Tooltip>
  );
}
