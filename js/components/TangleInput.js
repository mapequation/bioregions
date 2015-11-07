import React, {Component, PropTypes} from 'react';
import styles from './TangleInput.css';
import clamp from 'clamp';
import classNames from 'classnames';

class TangleInput extends Component {

    static propTypes = {
      value: PropTypes.number.isRequired,
      min: PropTypes.number,
      max: PropTypes.number,
      step: PropTypes.number,
      pixelDistance: PropTypes.number,
      format: PropTypes.func,
      className: PropTypes.string,
      onInput: PropTypes.func,
      onChange: PropTypes.func,
    }

    static defaultProps = {
      min: 0,
      max: 100,
      step: 1,
      pixelDistance: 0,
      format: (value, step) => step < 1? value.toFixed(Math.ceil(-Math.log10(step))) : value
    }

    constructor(props) {
      super(props);
      this.onMouseDown = ::this.onMouseDown;
      this.onMouseMove = ::this.onMouseMove;
      this.onMouseUp = ::this.onMouseUp;
      this.state = this.propsToState(props);
    }

    componentWillReceiveProps(nextProps) {
      this.setState(this.propsToState(nextProps));
    }

    propsToState(props) {
      let { min, max } = this.adjustedMinMax(props);
      let value = clamp(props.value, min, max);
      let currentStep = this.getStep(props.value, props);
      return {
        ...props,
        min,
        max,
        currentStep,
        value,
        formattedValue: this.props.format(value, currentStep),
        isChanged: false,
      };
    }

    getStep(value, props) {
      if (props.logStep)
        return Math.pow(10, Math.floor(Math.log10(value))) * props.logStep
      return props.step;
    }

    adjustedMinMax(props) {
      // Let bounds respect step resolution
      let minStep = this.getStep(props.min, props);
      let maxStep = this.getStep(props.max, props);
      let min = Math.ceil(props.min / minStep) * minStep;
      let max = Math.floor(props.max / maxStep) * maxStep;
      return { min, max };
    }

    stepRound(step, value) {
      return Math.round(value / step) * step;
    }

    onMouseDown(e) {
      e.preventDefault();
      this.setState({
        isPressed: true,
        startX: e.screenX,
        startValue: this.state.value,
        startFormattedValue: this.state.formattedValue
      });

      // To be sure it exist in mouseUp as setState doesn't immediately mutate the state
      this._immediateState = {
        value: this.state.value,
        startValue: this.state.value,
        isChanged: false
      };

      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
    }

    onMouseMove(e) {
      e.preventDefault();
      let change = e.screenX - this.state.startX;
      if (this.props.pixelDistance > 0)
        change = Math.floor(change / this.props.pixelDistance);

      let nextValue = this.state.startValue + (change * this.state.currentStep);

      // console.log(`${this.state.startValue} + (${change} * ${this.state.currentStep}) -> ${nextValue}`);

      // Adjust current step size if log step
      if (this.props.logStep) {
        this.state.currentStep = this.getStep(value, this.props);
      }

      nextValue = clamp(this.stepRound(this.state.currentStep, nextValue), this.state.min, this.state.max);

      // console.log(`  -> clamp(${this.state.min}, ${this.state.max}) -> ${nextValue}`);

      let nextFormattedValue = this.props.format(nextValue, this.state.currentStep);

      // Skip update if nothing visually changed
      if (nextFormattedValue === this.state.formattedValue)
        return;

      // isChanged compares the value between mouseDown and mouseUp
      let isChanged = nextFormattedValue !== this.state.startFormattedValue;

      this.setState({
        value: nextValue,
        formattedValue: nextFormattedValue,
        isChanged
      });

      this._immediateState.value = nextValue;
      this._immediateState.isChanged = isChanged;

      if (this.props.onInput)
        this.props.onInput(nextValue, this.state.value);
    }

    onMouseUp(e) {
      e.preventDefault();
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
      this.setState({
        isPressed: false,
      });
      if (this._immediateState.isChanged && this.props.onChange)
        this.props.onChange(this._immediateState.value, this._immediateState.startValue);
    }

    render() {
      let classes = classNames(
        "tangle",
        {[this.props.className]: this.props.className},
        {"tangle-pressed": this.state.isPressed},
        {"tangle-changed": this.state.isChanged},
      );
      // console.log(`classes: ${classes}`);
      return (
        <span className={classes}
          onMouseDown={this.onMouseDown}
          >{this.state.formattedValue}</span>
      )
    }
}

export default TangleInput;
