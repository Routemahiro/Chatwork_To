# Privacy Policy

Last updated: 2026-04-07

This extension, `Chatwork 全員に返信`, is designed to help users reply in Chatwork by inserting a standard reply tag and the relevant `To` recipients into the compose box.

## What data this extension handles

This extension may access the following information on Chatwork pages:

- Message content currently displayed on the page
- `To` recipient tags included in a message
- Message author information needed to build a reply
- The account ID configured by the user in the extension options

## How the data is used

The extension uses the above information only to provide its single purpose:

- Show a `全員に返信` action on Chatwork messages
- Insert the reply tag and collected `To` recipients into the Chatwork reply input box
- Exclude the user-configured self account ID from the generated recipient list

The extension does not automatically send messages. Sending is always performed by the user.

## Data storage

The extension stores only the self account ID entered by the user in the extension options.
This value is stored using Chrome extension storage so it can be used for recipient exclusion.

## Data sharing

This extension does not sell, transfer, or share user data with third parties.

## Remote transmission

This extension does not send the handled data to any developer-controlled server.

## Permissions

### Host permissions

The extension runs only on the following Chatwork domains in order to read the displayed message structure and insert reply content into the compose box:

- `https://www.chatwork.com/*`
- `https://kcw.chatwork.com/*`

### Storage permission

The `storage` permission is used only to save the self account ID configured by the user.

## Contact

Repository:

- [https://github.com/Routemahiro/Chatwork_To](https://github.com/Routemahiro/Chatwork_To)
