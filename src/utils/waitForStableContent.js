export async function waitForStableContent(
  locator,
  {
    quietMs = 500,
    timeoutMs = 10_000,
    validate = (text) => text.length > 0,
    read = null,
  } = {},
) {
  if (quietMs <= 0 || timeoutMs <= quietMs) {
    throw new Error('timeoutMs must be greater than quietMs');
  }

  const deadline = Date.now() + timeoutMs;
  let lastValue = '';

  while (true) {
    const remaining = deadline - Date.now();

    if (remaining <= quietMs) {
      throw new Error(
        `Timed out waiting for stable content. Last value: ${JSON.stringify(lastValue)}`
      );
    }

    // Wait for the selected DOM subtree to stop changing.
    const snapshot = await locator.evaluate(
      (element, { quietMs, remaining }) =>
        new Promise((resolve, reject) => {
          let quietTimer;
          let timeoutTimer;

          const observer = new MutationObserver(() => {
            clearTimeout(quietTimer);
            quietTimer = setTimeout(finish, quietMs);
          });

          function cleanup() {
            observer.disconnect();
            clearTimeout(quietTimer);
            clearTimeout(timeoutTimer);
          }

          function finish() {
            cleanup();

            resolve({
              text: element.textContent.trim(),
              markup: element.innerHTML,
            });
          }

          function fail() {
            cleanup();
            reject(new Error('DOM did not stabilize in time'));
          }

          observer.observe(element, {
            childList: true,
            characterData: true,
            attributes: true,
            subtree: true,
          });

          quietTimer = setTimeout(finish, quietMs);
          timeoutTimer = setTimeout(fail, remaining);
        }),
      { quietMs, remaining },
      { timeout: remaining + 1000 },
    );

    // Use a custom reader when supplied.
    // Otherwise, preserve the original textContent behavior.
    const value = read
      ? await read(locator)
      : snapshot.text;

    lastValue = value;

    // The DOM might have changed while we were reading it.
    // If so, wait for another quiet period.
    const currentMarkup = await locator.innerHTML();

    if (currentMarkup !== snapshot.markup) {
      continue;
    }

    if (await validate(value)) {
      return value;
    }

    // Stable doesn't necessarily mean ready.
    // Keep observing until validation succeeds.
  }
}
