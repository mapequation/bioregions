import * as ActionTypes from '../constants/ActionTypes';
import _ from 'lodash';

const initialState = {
  isShowingFileUI: false, // UI to load and see loaded files
  isLoading: false,
  files: [], // array of File objects to load
  urls: [], // urls to files to fetch
  basename: "Infomap bioregions",
  loadedSpecies: [],
  loadedTree: "", // filename of loaded tree
  haveFile: false,
  sampleFiles: [
    // {
    //   name: "Snakes (point occurrences)",
    //   filenames: ['snakes_global_gbif.txt']
    // },
    {
      name: "Mammals global",
      type: "point occurrences",
      size: "56Mb",
      filenames: ['mammals.txt']
    },
    {
      name: "Mammals South America",
      type: "point occurrences",
      size: "2.3Mb",
      filenames: ['mammals_gbif_SA.tsv']
    },
  ],
  error: false,
  message: "",
  subMessage: "",
  headLines: [],
  parsedHead: [], // To select name,lat,long fields in dsv file
  parsedFeatureProperty: null, // To select name field in shapefiles/GeoJSON
};

export default function files(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.SHOW_FILE_UI:
      return {
        ...state,
        isShowingFileUI: action.isShowingFileUI
      }
    case ActionTypes.FETCH_FILES:
      return {
        ...initialState,
        isShowingFileUI: true,
        urls: action.urls,
        isLoading: true
      }
    case ActionTypes.LOAD_FILES:
      let shpFile = action.files.filter(file => /shp$/.test(file.name));
      const filename = shpFile.length > 0 ? shpFile[0].name : action.files[0].name;
      const lastDot = filename.lastIndexOf(".");
      const basename = lastDot == -1? filename : filename.substring(0, lastDot);
      return {
        ...initialState, // Restore to initial state
        isShowingFileUI: true,
        files: action.files,
        basename,
        isLoading: true,
        haveFile: true
      };
    case ActionTypes.LOAD_TREE:
      return {
        ...state,
        loadedTree: action.file.name,
      }
    case ActionTypes.FILE_ERROR:
      if (!state.isLoading) //  If canceled, ignore further loading events
        return;
      return {
        ...state,
        error: true,
        message: action.message,
        subMessage: action.subMessage
      };
    case ActionTypes.REQUEST_DSV_COLUMN_MAPPING:
      if (!state.isLoading) //  If canceled, ignore further loading events
        return state;
      return {
        ...state,
        parsedHead: action.parsedHead
      };
    case ActionTypes.REQUEST_GEOJSON_NAME_FIELD:
      if (!state.isLoading) //  If canceled, ignore further loading events
        return state;
      return {
        ...state,
        parsedFeatureProperty: action.parsedFeatureProperty
      };
    case ActionTypes.CANCEL_FILE_ACTIONS:
      return initialState;
    case ActionTypes.ADD_SPECIES_AND_BINS:
      if (!state.isLoading) //  If canceled, ignore further loading events
        return state;
      return {
        ...state,
        isShowingFileUI: false,
        isLoading: false,
        headLines: [],
        parsedHead: [],
        parsedFeatureProperty: null,
      };
    case ActionTypes.ADD_PHYLO_TREE:
      if (!state.isLoading) //  If canceled, ignore further loading events
        return state;
      return {
        ...state,
        isShowingFileUI: false,
        isLoading: false,
      };
    case ActionTypes.REMOVE_SPECIES:
      return {
        ...initialState,
        isShowingFileUI: state.isShowingFileUI,
      };
    default:
      return state;
  }
}
