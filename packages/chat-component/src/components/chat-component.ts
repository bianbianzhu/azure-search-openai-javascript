/* eslint-disable unicorn/template-indent */
import { LitElement, html } from 'lit';
import DOMPurify from 'dompurify';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { chatHttpOptions, globalConfig, teaserListTexts, requestOptions } from '../config/global-config.js';
import { chatStyle } from '../styles/chat-component.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { produce } from 'immer';

// TODO: allow host applications to customize these icons

import iconLightBulb from '../../public/svg/lightbulb-icon.svg?raw';
import iconDelete from '../../public/svg/delete-icon.svg?raw';
import iconCancel from '../../public/svg/cancel-icon.svg?raw';
import iconSend from '../../public/svg/send-icon.svg?raw';
import iconClose from '../../public/svg/close-icon.svg?raw';
import iconUp from '../../public/svg/chevron-up-icon.svg?raw';

import './loading-indicator.js';
import './voice-input-button.js';
import './teaser-list-component.js';
import './document-previewer.js';
import './tab-component.js';
import './citation-list.js';
import './chat-thread-component.js';
import './chat-action-button.js';
import { type TabContent } from './tab-component.js';
import { ChatController } from './chat-controller.js';
import { ChatHistoryController } from './chat-history-controller.js';

/**
 * A chat component that allows the user to ask questions and get answers from an API.
 * The component also displays default prompts that the user can click on to ask a question.
 * The component is built as a custom element that extends LitElement.
 *
 * Labels and other aspects are configurable via properties that get their values from the global config file.
 * @element chat-component
 * @fires chat-component#questionSubmitted - Fired when the user submits a question
 * @fires chat-component#defaultQuestionClicked - Fired when the user clicks on a default question
 * */

@customElement('chat-component')
export class ChatComponent extends LitElement {
  //--
  // Public attributes
  // -

  @property({ type: String, attribute: 'data-input-position' })
  inputPosition = 'sticky';

  @property({ type: String, attribute: 'data-interaction-model' })
  interactionModel: 'ask' | 'chat' = 'chat';

  @property({ type: String, attribute: 'data-api-url' })
  apiUrl = chatHttpOptions.url;

  @property({ type: String, attribute: 'data-use-stream', converter: (value) => value?.toLowerCase() === 'true' })
  useStream: boolean = chatHttpOptions.stream;

  @property({ type: String, attribute: 'data-overrides', converter: (value) => JSON.parse(value || '{}') })
  overrides: RequestOverrides = {};

  //--

  @property({ type: String })
  currentQuestion = '';

  @query('#question-input')
  questionInput!: HTMLInputElement;

  // Default prompts to display in the chat
  @state()
  isDisabled = false;

  @state()
  isChatStarted = false;

  @state()
  isResetInput = false;

  private chatController = new ChatController(this);
  private chatHistoryController = new ChatHistoryController(this);

  // Is showing thought process panel
  @state()
  isShowingThoughtProcess = false;

  @state()
  isDefaultPromptsEnabled: boolean = globalConfig.IS_DEFAULT_PROMPTS_ENABLED && !this.isChatStarted;

  @state()
  selectedCitation: Citation | undefined = undefined;

  @state()
  selectedChatEntry: ChatThreadEntry | undefined = undefined;

  selectedAsideTab: 'tab-thought-process' | 'tab-support-context' | 'tab-citations' = 'tab-thought-process';

  // These are the chat bubbles that will be displayed in the chat
  chatThread: ChatThreadEntry[] = [];

  static override styles = [chatStyle];

  setQuestionInputValue(value: string): void {
    this.questionInput.value = DOMPurify.sanitize(value || '');
    this.currentQuestion = this.questionInput.value;
  }

  handleVoiceInput(event: CustomEvent): void {
    event?.preventDefault();
    this.setQuestionInputValue(event?.detail?.input);
  }

  handleQuestionInputClick(event: CustomEvent): void {
    event?.preventDefault();
    this.setQuestionInputValue(event?.detail?.question);
  }

  handleCitationClick(event: CustomEvent): void {
    event?.preventDefault();
    this.selectedCitation = event?.detail?.citation;

    if (!this.isShowingThoughtProcess) {
      if (event?.detail?.chatThreadEntry) {
        this.selectedChatEntry = event?.detail?.chatThreadEntry;
      }
      this.handleExpandAside();
      this.selectedAsideTab = 'tab-citations';
    }
  }

  // Handle the click on the chat button and send the question to the API
  async handleUserChatSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.collapseAside(event);
    const question = DOMPurify.sanitize(this.questionInput.value);
    this.isChatStarted = true;
    this.isDefaultPromptsEnabled = false;
    this.questionInput.value = '';

    await this.chatController.generateAnswer(
      {
        ...requestOptions,
        overrides: {
          ...requestOptions.overrides,
          ...this.overrides,
        },
        question,
        type: this.interactionModel,
      },
      {
        // use defaults
        ...chatHttpOptions,

        // override if the user has provided different values
        url: this.apiUrl,
        stream: this.useStream,
      },
    );

    if (this.interactionModel === 'chat') {
      this.chatHistoryController.saveChatHistory(this.chatThread);
    }
  }

  // Reset the input field and the current question
  resetInputField(event: Event): void {
    event.preventDefault();
    this.questionInput.value = '';
    this.currentQuestion = '';
    this.isResetInput = false;
  }

  // Reset the chat and show the default prompts
  resetCurrentChat(event: Event): void {
    this.isChatStarted = false;
    this.chatThread = [];
    this.isDisabled = false;
    this.isDefaultPromptsEnabled = true;
    this.selectedCitation = undefined;
    this.chatController.reset();
    // clean up the current session content from the history too
    this.chatHistoryController.saveChatHistory(this.chatThread);
    this.collapseAside(event);
    this.handleUserChatCancel(event);
  }

  // Show the default prompts when enabled
  showDefaultPrompts(event: Event): void {
    if (!this.isDefaultPromptsEnabled) {
      this.resetCurrentChat(event);
    }
  }

  // Handle the change event on the input field
  handleOnInputChange(): void {
    this.isResetInput = !!this.questionInput.value;
  }

  // Stop generation
  handleUserChatCancel(event: Event): any {
    event?.preventDefault();
    this.chatController.cancelRequest();
  }

  // show thought process aside
  handleExpandAside(event: Event | undefined = undefined): void {
    event?.preventDefault();
    this.isShowingThoughtProcess = true;
    this.selectedAsideTab = 'tab-thought-process';
    this.shadowRoot?.querySelector('#overlay')?.classList.add('active');
    this.shadowRoot?.querySelector('#chat__containerWrapper')?.classList.add('aside-open');
  }

  // hide thought process aside
  collapseAside(event: Event): void {
    event.preventDefault();
    this.isShowingThoughtProcess = false;
    this.selectedCitation = undefined;
    this.shadowRoot?.querySelector('#chat__containerWrapper')?.classList.remove('aside-open');
    this.shadowRoot?.querySelector('#overlay')?.classList.remove('active');
  }

  renderChatOrCancelButton() {
    const submitChatButton = html`<button
      class="chatbox__button"
      data-testid="submit-question-button"
      @click="${this.handleUserChatSubmit}"
      title="${globalConfig.CHAT_BUTTON_LABEL_TEXT}"
      ?disabled="${this.isDisabled}"
    >
      ${unsafeSVG(iconSend)}
    </button>`;
    const cancelChatButton = html`<button
      class="chatbox__button"
      data-testid="cancel-question-button"
      @click="${this.handleUserChatCancel}"
      title="${globalConfig.CHAT_CANCEL_BUTTON_LABEL_TEXT}"
    >
      ${unsafeSVG(iconCancel)}
    </button>`;

    return this.chatController.isProcessingResponse ? cancelChatButton : submitChatButton;
  }

  renderChatEntryTabContent(entry: ChatThreadEntry) {
    return html` <tab-component
      .tabs="${[
        {
          id: 'tab-thought-process',
          label: globalConfig.THOUGHT_PROCESS_LABEL,
        },
        {
          id: 'tab-support-context',
          label: globalConfig.SUPPORT_CONTEXT_LABEL,
        },
        {
          id: 'tab-citations',
          label: globalConfig.CITATIONS_TAB_LABEL,
        },
      ] as TabContent[]}"
      .selectedTabId="${this.selectedAsideTab}"
    >
      <div slot="tab-thought-process" class="tab-component__content">
        ${entry && entry.thoughts ? html` <p class="tab-component__paragraph">${unsafeHTML(entry.thoughts)}</p> ` : ''}
      </div>
      <div slot="tab-support-context" class="tab-component__content">
        ${entry && entry.dataPoints
          ? html` <teaser-list-component
              .alwaysRow="${true}"
              .teasers="${entry.dataPoints.map((d) => {
                return { description: d };
              })}"
            ></teaser-list-component>`
          : ''}
      </div>
      ${entry && entry.citations
        ? html`
            <div slot="tab-citations" class="tab-component__content">
              <citation-list
                .citations="${entry.citations}"
                .label="${globalConfig.CITATIONS_LABEL}"
                .selectedCitation="${this.selectedCitation}"
                @on-citation-click="${this.handleCitationClick}"
              ></citation-list>
              ${this.selectedCitation
                ? html`<document-previewer
                    url="${this.apiUrl}/content/${this.selectedCitation.text}"
                  ></document-previewer>`
                : ''}
            </div>
          `
        : ''}
    </tab-component>`;
  }

  handleChatEntryActionButtonClick(event: CustomEvent) {
    if (event.detail?.id === 'chat-show-thought-process') {
      this.selectedChatEntry = event.detail?.chatThreadEntry;
      this.handleExpandAside(event);
    }
  }

  override willUpdate(): void {
    this.isDisabled = this.chatController.generatingAnswer;

    if (this.chatController.processingMessage) {
      this.chatThread = produce(this.chatThread, (draft) => {
        const processingEntry = this.chatController.processingMessage as ChatThreadEntry;
        const index = draft.findIndex((entry) => entry.id === processingEntry.id);
        if (index > -1) {
          draft[index] = processingEntry;
        } else {
          draft.push(processingEntry);
        }
      });
    }
  }

  renderChatThread(chatThread: ChatThreadEntry[]) {
    return html`<chat-thread-component
      .chatThread="${chatThread}"
      .actionButtons="${[
        {
          id: 'chat-show-thought-process',
          label: globalConfig.SHOW_THOUGH_PROCESS_BUTTON_LABEL_TEXT,
          svgIcon: iconLightBulb,
          isDisabled: this.isShowingThoughtProcess,
        },
      ] as any}"
      .isDisabled="${this.isDisabled}"
      .isProcessingResponse="${this.chatController.isProcessingResponse}"
      .selectedCitation="${this.selectedCitation}"
      @on-action-button-click="${this.handleChatEntryActionButtonClick}"
      @on-citation-click="${this.handleCitationClick}"
      @on-followup-click="${this.handleQuestionInputClick}"
    >
    </chat-thread-component>`;
  }

  // Render the chat component as a web component
  override render() {
    return html`
      <div id="overlay" class="overlay"></div>
      <section id="chat__containerWrapper" class="chat__containerWrapper">
        <section class="chat__container" id="chat-container">
          ${this.isChatStarted
            ? html`
                <div class="chat__header">
                  ${this.interactionModel === 'chat' ? this.chatHistoryController.renderHistoryButton() : ''}
                  <chat-action-button
                    .label="${globalConfig.RESET_CHAT_BUTTON_TITLE}"
                    actionId="chat-reset-button"
                    @click="${this.resetCurrentChat}"
                    .svgIcon="${iconDelete}"
                  >
                  </chat-action-button>
                </div>
                ${this.chatHistoryController.showChatHistory
                  ? html`<div class="chat-history__container">
                      ${this.renderChatThread(this.chatHistoryController.chatHistory)}
                      <div class="chat-history__footer">
                        ${unsafeSVG(iconUp)} ${globalConfig.CHAT_HISTORY_FOOTER_TEXT} ${unsafeSVG(iconUp)}
                      </div>
                    </div>`
                  : ''}
                ${this.renderChatThread(this.chatThread)}
              `
            : ''}
          ${this.chatController.isAwaitingResponse
            ? html`<loading-indicator label="${globalConfig.LOADING_INDICATOR_TEXT}"></loading-indicator>`
            : ''}
          <!-- Teaser List with Default Prompts -->
          <div class="chat__container">
            <!-- Conditionally render default prompts based on isDefaultPromptsEnabled -->
            ${this.isDefaultPromptsEnabled
              ? html`
                  <teaser-list-component
                    .heading="${this.interactionModel === 'chat'
                      ? teaserListTexts.HEADING_CHAT
                      : teaserListTexts.HEADING_ASK}"
                    .clickable="${true}"
                    .actionLabel="${teaserListTexts.TEASER_CTA_LABEL}"
                    @teaser-click="${this.handleQuestionInputClick}"
                    .teasers="${teaserListTexts.DEFAULT_PROMPTS}"
                  ></teaser-list-component>
                `
              : ''}
          </div>
          <form
            id="chat-form"
            class="form__container ${this.inputPosition === 'sticky' ? 'form__container-sticky' : ''}"
          >
            <div class="chatbox__container container-col container-row">
              <div class="chatbox__input-container display-flex-grow container-row">
                <input
                  class="chatbox__input display-flex-grow"
                  data-testid="question-input"
                  id="question-input"
                  placeholder="${globalConfig.CHAT_INPUT_PLACEHOLDER}"
                  aria-labelledby="chatbox-label"
                  id="chatbox"
                  name="chatbox"
                  type="text"
                  :value=""
                  ?disabled="${this.isDisabled}"
                  autocomplete="off"
                  @keyup="${this.handleOnInputChange}"
                />
                ${this.isResetInput ? '' : html`<voice-input-button @on-voice-input="${this.handleVoiceInput}" />`}
              </div>
              ${this.renderChatOrCancelButton()}
              <button
                title="${globalConfig.RESET_BUTTON_TITLE_TEXT}"
                class="chatbox__button--reset"
                .hidden="${!this.isResetInput}"
                type="reset"
                id="resetBtn"
                title="Clear input"
                @click="${this.resetInputField}"
              >
                ${globalConfig.RESET_BUTTON_LABEL_TEXT}
              </button>
            </div>

            ${this.isDefaultPromptsEnabled
              ? ''
              : html`<div class="chat__containerFooter">
                  <button type="button" @click="${this.showDefaultPrompts}" class="defaults__span button">
                    ${globalConfig.DISPLAY_DEFAULT_PROMPTS_BUTTON}
                  </button>
                </div>`}
          </form>
        </section>
        ${this.isShowingThoughtProcess
          ? html`
              <aside class="aside" data-testid="aside-thought-process">
                <div class="aside__header">
                  <chat-action-button
                    .label="${globalConfig.HIDE_THOUGH_PROCESS_BUTTON_LABEL_TEXT}"
                    actionId="chat-hide-thought-process"
                    @click="${this.collapseAside}"
                    .svgIcon="${iconClose}"
                  >
                  </chat-action-button>
                </div>
                ${this.renderChatEntryTabContent(this.selectedChatEntry as ChatThreadEntry)}
              </aside>
            `
          : ''}
      </section>
    `;
  }
}
