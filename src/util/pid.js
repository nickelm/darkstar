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

  setTarget(target) {}
  getTarget() {}
  
  update(delta, processVariable) {}
  
  reset() {}
}