<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class StudentPolicyOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $otp, public string $title) {}

    public function build(): self
    {
        return $this->subject('رمز التحقق لمدونة سلوك طلبة الطب')
            ->view('emails.student-policy-otp');
    }
}
