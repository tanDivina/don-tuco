// Inbound voice notes: EUM Social copies the audio to S3, Amazon Transcribe turns it into text.
// Off until MEDIA_BUCKET is set (scripts/enable-voice.sh); the bucket expires objects after a day.
import { SocialMessagingClient, GetWhatsAppMessageMediaCommand } from "@aws-sdk/client-socialmessaging";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  DeleteTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";

const social = new SocialMessagingClient({});
const transcribe = new TranscribeClient({});
const BUCKET = process.env.MEDIA_BUCKET || "";
const ORIGINATION_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
// Pack language -> Transcribe locale for automatic language identification.
const LOCALES = { es: "es-US", en: "en-US", nl: "nl-NL", pt: "pt-BR", fr: "fr-FR", de: "de-DE" };

// WhatsApp audio MIME subtype -> file extension EUM writes, which is also Transcribe's MediaFormat.
const FORMATS = { ogg: "ogg", mpeg: "mp3", mp4: "mp4", amr: "amr" };

export const canTranscribe = () => Boolean(BUCKET);

/** Returns the spoken text of a WhatsApp voice note, or "" if nothing was said. Throws on failure. */
export async function transcribeVoiceNote(mediaId, languages = ["es", "en"]) {
  // EUM treats the key as a prefix and appends "<mediaId>.<ext>" itself.
  const { mimeType = "audio/ogg" } = await social.send(
    new GetWhatsAppMessageMediaCommand({
      mediaId,
      originationPhoneNumberId: ORIGINATION_ID,
      destinationS3File: { bucketName: BUCKET, key: "voice/" },
    })
  );
  const ext = FORMATS[mimeType.split(";")[0].split("/")[1]];
  if (!ext) throw new Error(`unsupported audio type ${mimeType}`);
  const key = `voice/${mediaId}.${ext}`;

  const options = [...new Set(languages.map((l) => LOCALES[l]).filter(Boolean))];
  const job = `don-tuco-${mediaId}-${Date.now()}`.replace(/[^0-9a-zA-Z._-]/g, "").slice(0, 200);
  await transcribe.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: job,
      Media: { MediaFileUri: `s3://${BUCKET}/${key}` },
      MediaFormat: ext,
      ...(options.length >= 2 ? { IdentifyLanguage: true, LanguageOptions: options } : { LanguageCode: options[0] || "es-US" }),
    })
  );

  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const { TranscriptionJob: j } = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: job }));
      if (j.TranscriptionJobStatus === "FAILED") throw new Error(j.FailureReason || "transcription failed");
      if (j.TranscriptionJobStatus === "COMPLETED") {
        const data = await (await fetch(j.Transcript.TranscriptFileUri)).json();
        return (data.results?.transcripts || []).map((t) => t.transcript).join(" ").trim();
      }
    }
    throw new Error("transcription timed out");
  } finally {
    // Guests' words shouldn't outlive the reply.
    await transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: job })).catch(() => {});
  }
}
