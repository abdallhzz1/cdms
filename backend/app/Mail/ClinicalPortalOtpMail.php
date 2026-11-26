<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;

class ClinicalPortalOtpMail extends Mailable
{
    public function __construct(public string $otp) {}

    public function build(): self
    {
        return $this->subject(__('clinical_feedback.otp_subject'))->view('emails.clinical-portal-otp');
    }
}
