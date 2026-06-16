import { observer } from 'mobx-react';
import { Box, IconButton, Text } from '@chakra-ui/react';
import { LuSettings } from 'react-icons/lu';
import { useStore } from '../../store';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
} from '../ui/popover';
import { Switch } from '../ui/switch';

/**
 * Gear button at the right edge of a status bar. Opens a small popover with the
 * shared "Show labels" toggle (off by default — the icons stand on their own).
 */
export default observer(function StatusBarSettings() {
  const { settingsStore } = useStore();
  return (
    <Box ml="auto" alignSelf="center">
      <PopoverRoot positioning={{ placement: 'bottom-end' }}>
        <PopoverTrigger asChild>
          <IconButton
            aria-label="Status bar settings"
            size="2xs"
            variant="ghost"
            color="fg.muted"
          >
            <LuSettings />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent width="auto">
          <PopoverArrow />
          <PopoverBody>
            <Box display="flex" alignItems="center" gap={3}>
              <Text fontSize="sm">Show labels</Text>
              <Switch
                checked={settingsStore.showStatusBarLabels}
                onCheckedChange={() =>
                  settingsStore.setShowStatusBarLabels(
                    !settingsStore.showStatusBarLabels,
                  )
                }
              />
            </Box>
          </PopoverBody>
        </PopoverContent>
      </PopoverRoot>
    </Box>
  );
});
