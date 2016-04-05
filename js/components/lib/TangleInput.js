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
      logStep: PropTypes.number,
      speed: PropTypes.number,
      format: PropTypes.func,
      prefix: PropTypes.string,
      suffix: PropTypes.string,
      className: PropTypes.string,
      onInput: PropTypes.func,
      onChange: PropTypes.func,
    }

    static defaultProps = {
      min: 0,
      max: 100,
      step: 1,
      speed: 1, // steps per pixel change
      format: (value, step) => step < 1? value.toFixed(Math.ceil(-Math.log10(step))) : value,
      prefix: "",
      suffix: "",
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
      let currentStep = this.getStep(value, props);
      return {
        ...props,
        min,
        max,
        value,
        formattedValue: this.props.format(value, currentStep),
        isChanged: false,
      };
    }

    getStep(value, props) {
      if (props.logStep) {
        return value <= 0? 1 : Math.pow(10, Math.floor(Math.log10(value))) * props.logStep;
      }
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
        lastX: e.screenX,
        currentStep:this.getStep(this.state.value, this.props),
        isChanged: false
      };

      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
    }

    onMouseMove(e) {
      e.preventDefault();
      const {speed} = this.props; // steps per pixel change
      const pixelChange = e.screenX - this._immediateState.lastX;
      const numSteps = pixelChange > 0? Math.floor(speed * pixelChange) : Math.ceil(speed * pixelChange);
      if (numSteps === 0)
        return;

      let currentStep = this._immediateState.currentStep;

      let nextValue = this._immediateState.value + (numSteps * currentStep);

      // Clamp to step-resolved bounds
      nextValue = clamp(nextValue, this.state.min, this.state.max);

      // Adjust current step size if log step
      if (this.props.logStep) {
        let nextStep = this.getStep(nextValue, this.props);
        let oldLog = Math.floor(Math.log10(this._immediateState.value));
        let newLog = Math.floor(Math.log10(nextValue));
        if (newLog !== oldLog) {
          if (newLog < oldLog) {
            // Recalculate next value with smaller step size, so e.g. 200, 100, 0 -> 200, 100, 90, ...
            // nextStep = Math.pow(10, Math.floor(oldLog - 1)) * this.props.logStep;
            nextValue = this._immediateState.value + (numSteps * nextStep);
            // Re-calculate new step size
            nextStep = this.getStep(nextValue, this.props);
            // nextValue = this.stepRound(nextStep, nextValue);
          }
          currentStep = this._immediateState.currentStep = nextStep;
          // Round to step resolution
          nextValue = this.stepRound(currentStep, nextValue);
          // Clamp to step-resolved bounds
          nextValue = clamp(nextValue, this.state.min, this.state.max);
        }
      }


      // console.log(`  -> clamp(${this.state.min}, ${this.state.max}) -> ${nextValue}`);

      let nextFormattedValue = this.props.format(nextValue, currentStep);

      // isChanged compares the value between mouseDown and mouseUp
      let isChanged = nextFormattedValue !== this.state.startFormattedValue;

      this._immediateState.value = nextValue;
      this._immediateState.isChanged = isChanged;
      this._immediateState.lastX = e.screenX;

      // Skip update if nothing visually changed
      if (nextFormattedValue === this.state.formattedValue)
        return;

      this.setState({
        value: nextValue,
        formattedValue: nextFormattedValue,
        isChanged
      });

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
      return (
        <span className={classes}
          onMouseDown={this.onMouseDown}
          >{`${this.props.prefix}${this.state.formattedValue}${this.props.suffix}`}</span>
      )
    }
}

export default TangleInput;
