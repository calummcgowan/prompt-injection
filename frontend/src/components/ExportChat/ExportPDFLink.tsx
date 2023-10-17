import { PDFDownloadLink } from "@react-pdf/renderer";
import { ChatMessage } from "../../models/chat";
import { EmailInfo } from "../../models/email";
import { LEVEL_NAMES } from "../../models/level";
import ExportContent from "./ExportContent";

import "./ExportPDFLink.css";

function ExportPDFLink({
  messages,
  emails,
  currentLevel,
}: {
  messages: ChatMessage[];
  emails: EmailInfo[];
  currentLevel: LEVEL_NAMES;
}) {
  function getFileName() {
    if (currentLevel === LEVEL_NAMES.SANDBOX) {
      return "spy-logic-chat-log-sandbox.pdf";
    } else {
      return `spy-logic-chat-log-level-${currentLevel}.pdf`;
    }
  }

  return (
    <div id="export-chat-box" className="themed-button">
      <PDFDownloadLink
        document={
          <ExportContent
            messages={messages}
            emails={emails}
            currentLevel={currentLevel}
          />
        }
        className="export-chat-link"
        fileName={getFileName()}
      >
        Export
      </PDFDownloadLink>
    </div>
  );
}

export default ExportPDFLink;
