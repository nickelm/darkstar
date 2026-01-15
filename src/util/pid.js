export class PIDController {
  constructor(Kp, Ki, Kd, maxOutput, maxChange) {
    this.Kp = Kp;
    this.Ki = Ki;
    this.Kd = Kd;
    this.maxOutput = maxOutput;
    this.maxChange = maxChange;

    this.target = 0;
    this.integral = 0;
    this.preError = 0;
    this.output = 0;
    this.outputLast = 0;
  }

  setTarget(target) {
    this.target = target;
  }

  getTarget() {
    return this.target;
  }

  update(delta, processVariable) {
    // Calculate error with angle wrapping for heading control
    let error = this.target - processVariable;
    while (error > 180) error -= 360;
    while (error < -180) error += 360;

    // Proportional term
    const P = this.Kp * error;

    // Integral term with anti-windup clamping
    this.integral += error * delta;
    const maxIntegral = this.Ki > 0 ? this.maxOutput / this.Ki : this.maxOutput;
    this.integral = Math.max(-maxIntegral, Math.min(maxIntegral, this.integral));
    const I = this.Ki * this.integral;

    // Derivative term
    const D = delta > 0 ? this.Kd * (error - this.preError) / delta : 0;
    this.preError = error;

    // Compute and clamp output
    let output = P + I + D;
    output = Math.max(-this.maxOutput, Math.min(this.maxOutput, output));

    // Rate limiting
    const maxDelta = this.maxChange * delta;
    const deltaOutput = output - this.outputLast;
    if (Math.abs(deltaOutput) > maxDelta) {
      output = this.outputLast + Math.sign(deltaOutput) * maxDelta;
    }

    this.outputLast = output;
    this.output = output;
    return output;
  }

  reset() {
    this.integral = 0;
    this.preError = 0;
    this.output = 0;
    this.outputLast = 0;
  }
}