import { extendTheme } from '@chakra-ui/react';
import { tableAnatomy as parts } from '@chakra-ui/anatomy';
import { mode } from '@chakra-ui/theme-tools';
import type {
  PartsStyleFunction,
  SystemStyleObject,
} from '@chakra-ui/theme-tools';

const numericStyles: SystemStyleObject = {
  '&[data-is-numeric=true]': {
    textAlign: 'end',
  },
};

const tableVariantSimpler: PartsStyleFunction<typeof parts> = (props) => {
  const { colorScheme: c } = props;
  console.log(props);
  return {
    th: {
      color: mode('gray.600', 'gray.400')(props),
      borderBottom: '1px',
      borderColor: mode(`${c}.100`, `${c}.700`)(props),
      ...numericStyles,
    },
    td: {
      // borderBottom: '1px',
      borderColor: mode(`${c}.100`, `${c}.700`)(props),
      ...numericStyles,
    },
    caption: {
      color: mode('gray.600', 'gray.100')(props),
    },
    tfoot: {
      td: {
        // borderColor: `${mode(`${c}.100`, `${c}.700`)(props)} !important`,
        borderColor: 'var(--chakra-colors-gray-100) !important',
        borderTop: '1px',
        ...numericStyles,
      },
      tr: {
        '&:last-of-type': {
          th: { borderBottomWidth: 0 },
        },
      },
    },
  };
};

const theme = extendTheme({
  components: {
    Table: {
      variants: {
        simpler: tableVariantSimpler,
      },
    },
  },
});

export default theme;
