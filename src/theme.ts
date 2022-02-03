import { extendTheme } from '@chakra-ui/react';
import { tableAnatomy as parts } from '@chakra-ui/anatomy';
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
  const paddingTop = '5px !important';

  return {
    thead: {
      th: {
        textAlign: 'center !important',
        paddingTop,
        paddingBottom: paddingTop,
      },
    },
    td: {
      '&:first-of-type': {
        paddingInlineStart: '0 !important',
        textAlign: 'start',
      },
      '&:last-of-type': {
        paddingInlineEnd: '0 !important',
      },
      textAlign: 'end',
      paddingTop,
      paddingBottom: paddingTop,
    },
    tfoot: {
      td: {
        borderColor: 'var(--chakra-colors-gray-100) !important',
        borderTop: '1px',
        paddingTop,
        paddingBottom: paddingTop,
        ...numericStyles,
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
  fonts: {
    brand: 'Philosopher',
    // heading: 'Open Sans',
    // body: 'Raleway',
  },
  // colors: {
  //   black: '#666',
  // },
});

export default theme;
