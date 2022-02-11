import PropTypes from 'prop-types';
import React from 'react';
import Checkbox from '../helpers/Checkbox';
import Tooltip from '../lib/Tooltip';
import TangleInput from '../lib/TangleInput';
import InlineForm from '../helpers/InlineForm';
import Div from '../helpers/Div';
import * as Binning from '../../constants/Binning';

export default function GridControl(props) {
  return (
    <div>
      <div className="ui horizontal divider">
        Grid
        <span>
          <Tooltip>
            <i className="help icon" style={{color: '#ccc'}}></i>
            <div className="ui floating segment">
              <table className="ui very basic celled table" style={{
                  backgroundColor: "white",
                  width: "400px",
                  fontWeight: 300,
                }}>
                <tbody>
                  <tr>
                    <td><strong>Grid resolution</strong></td>
                    <td>The resolution of the grid overlay.</td>
                  </tr>
                  <tr>
                    <td><strong>Show grid</strong></td>
                    <td>Toggle the visibility of the grid.</td>
                  </tr>
                  <tr>
                    <td><strong>Clip to land</strong></td>
                    <td>Clip the occupied grid cells to the land borders.</td>
                  </tr>
                  <tr>
                    <td><strong>Show cell borders</strong></td>
                    <td>Show borders on occupied grid cells.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Tooltip>
        </span>
      </div>


      <InlineForm label="Grid resolution">
        <TangleInput className="ui label" suffix={props.binning === Binning.MINUTE ? Binning.MINUTE_SYMBOL : Binning.DEGREE_SYMBOL}
          value={props.graticuleStep}
          min={1}
          max={180}
          step={1}
          onChange={(value) => props.changeGraticuleStep(value)} />
      </InlineForm>
      <Div paddingTop="10px">
        <Checkbox label="Show grid" checked={props.showGraticules} onChange={props.changeShowGraticules}/>
      </Div>
      <Div paddingTop="10px">
        <Checkbox label="Clip to land" checked={props.clipToLand} onChange={props.changeClipToLand}/>
      </Div>
      <Div paddingTop="10px">
        <Checkbox label="Show cell borders" checked={props.showCellBorders} onChange={props.changeShowCellBorders}/>
      </Div>
    </div>
  );
}

GridControl.propTypes = {
  graticuleStep: PropTypes.number.isRequired,
  showGraticules: PropTypes.bool.isRequired,
  clipToLand: PropTypes.bool.isRequired,
  showCellBorders: PropTypes.bool.isRequired,
  changeGraticuleStep: PropTypes.func.isRequired,
  changeShowGraticules: PropTypes.func.isRequired,
  changeClipToLand: PropTypes.func.isRequired,
  changeShowCellBorders: PropTypes.func.isRequired,
  binning: PropTypes.object.isRequired,
};
