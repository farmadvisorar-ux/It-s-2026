/**
 * Shared handler for the quote and contact forms.
 *
 * Submits over fetch rather than a native POST so the visitor stays on the
 * site — a native Formspree post bounces them to formspree.io's own thank-you
 * page, which loses the lead's attention right after they convert.
 *
 * Formspree specifics relied on here:
 *   - `Accept: application/json` makes it return JSON instead of redirecting
 *   - a field named `email` is used automatically as the reply-to address
 *   - `_subject` sets the subject line of the notification email
 *   - `_gotcha` is its built-in honeypot; anything non-empty is discarded
 */

import site from '../data/site.json';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The phone number lives in site.json and is withheld until the line is live,
// so no message here may hardcode one. `phonePending` keeps a half-configured
// number out of the copy the same way `emailPending` keeps it out of the schema.
const phone = site.phonePending ? '' : site.phone;
const urgentLine = phone ? ` If it is urgent, call us on ${phone}.` : '';
const retryLine = phone ? `Please call ${phone} or try again.` : 'Please try again in a moment.';

function clearErrors(form) {
  form.querySelectorAll('.err').forEach((n) => n.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((n) => n.removeAttribute('aria-invalid'));
}

function fieldError(el, message) {
  el.setAttribute('aria-invalid', 'true');
  const p = document.createElement('p');
  p.className = 'err';
  p.textContent = message;
  el.parentElement.appendChild(p);
}

function validate(form) {
  clearErrors(form);
  let ok = true;
  form.querySelectorAll('[required]').forEach((el) => {
    const value = el.value.trim();
    if (value === '') {
      fieldError(el, 'This field is required.');
      ok = false;
    } else if (el.type === 'email' && !EMAIL_RE.test(value)) {
      fieldError(el, 'Enter a valid email address.');
      ok = false;
    }
  });
  return ok;
}

function replaceWith(form, html) {
  form.insertAdjacentHTML('beforebegin', html);
  form.style.display = 'none';
}

const successHtml = (heading, body) =>
  `<div class="form-success" role="status">
     <strong>${heading}</strong>
     <p style="margin-top:.5rem;font-size:.9375rem;color:var(--text-muted)">${body}</p>
   </div>`;

export function wireForm(formId, { successHeading, successBody } = {}) {
  const form = document.getElementById(formId);
  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const originalLabel = button?.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot: a real person never fills this. Pretend it worked and drop it,
    // so a bot gets no signal about why it failed.
    if (form._gotcha && form._gotcha.value !== '') {
      replaceWith(form, successHtml('Thanks — we have your message.', 'We will be in touch shortly.'));
      return;
    }

    if (!validate(form)) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const action = form.getAttribute('action');
    if (!action) {
      // Never imply a lead was delivered when there is nowhere to deliver it.
      replaceWith(
        form,
        successHtml(
          'Form endpoint not configured.',
          'This submission was <strong>not</strong> sent. Set PUBLIC_FORM_ENDPOINT to go live.'
        )
      );
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Sending…';
    }

    try {
      const res = await fetch(action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        replaceWith(
          form,
          successHtml(
            successHeading ?? 'Thanks — we have your request.',
            (successBody ?? 'We will come back to you with a written quote.') + urgentLine
          )
        );
        return;
      }

      // Formspree returns field-level detail on validation failures.
      let detail = '';
      try {
        const json = await res.json();
        detail = (json.errors ?? []).map((x) => x.message).join(' ');
      } catch { /* non-JSON error body */ }

      throw new Error(detail || `Server returned ${res.status}`);
    } catch (err) {
      clearErrors(form);
      const p = document.createElement('p');
      p.className = 'err form-error';
      p.setAttribute('role', 'alert');
      p.textContent = `Sorry — that did not send. ${err.message}. ${retryLine}`;
      button?.insertAdjacentElement('afterend', p);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  });
}
