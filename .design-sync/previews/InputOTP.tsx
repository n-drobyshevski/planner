import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
  Label,
} from "planner";

export function FourDigit() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label>Verification code</Label>
      <InputOTP maxLength={4} value="4821">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

export function Pin() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label>Account PIN</Label>
      <InputOTP maxLength={8} value="73914062">
        <InputOTPGroup>
          <InputOTPSlot index={0} mask />
          <InputOTPSlot index={1} mask />
          <InputOTPSlot index={2} mask />
          <InputOTPSlot index={3} mask />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={4} mask />
          <InputOTPSlot index={5} mask />
          <InputOTPSlot index={6} mask />
          <InputOTPSlot index={7} mask />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

export function Partial() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label>Enter the code we sent</Label>
      <InputOTP maxLength={6} value="42">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label className="opacity-50">Verification code</Label>
      <InputOTP maxLength={4} value="1290" disabled>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
