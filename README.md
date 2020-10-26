# IVR Tester

![](https://github.com/SketchingDev/ivr-tester/workflows/On%20Push/badge.svg)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/SketchingDev/ivr-tester.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/SketchingDev/ivr-tester/context:javascript)

WARNING: This project is under heavy development so APIs are likely to change.

An automated testing framework for Interactive Voice Response (IVR) call flows.

IVR Tester calls a phone number and impersonates a human. It does this by automatically transcribing voice responses
to text and then uses these, along with a test definition, to determine how it should respond. A successful test is one
that manages to navigate a call flow using all of its conditions.

```typescript
testRunner()(
  { from: "0123 456 789", to: "0123 123 123" }, 
  { name: "Customer is asked to provide account number",
    test: ordered([
      {
        when: similarTo("Press 1 to update your account details"),
        then: press("1"),
      },
      {
        when: contains("enter your account number"),
        then: doNothing(),
      },
    ]),
  },
  { name: "Customer is told their option is unrecognised",
    test: ordered([
      {
        when: similarTo("Press 1 to update your account details"),
        then: press("2"),
      },
      {
        when: similarTo("Sorry, we did not understand your response"),
        then: doNothing(),
      },
    ]),
  }
);
```

## How it works

<p align="center">
  <img src="docs/flow.jpg">
</p>

Under the hood this orchestrates: 
 1. Making a call to the IVR flow - using [Twilio](https://www.twilio.com/)
 2. Receiving the bi-directional audio stream of the call
 3. Transcribing the voice responses from the flow - using [Google Speech-to-Text](https://cloud.google.com/speech-to-text)
 4. Using the test to conditionally respond with DTMF tones to transcripts

## Getting Started

1. Start ngrok 
   ```shell
   ngrok http 8080
   ```
2. Run the tests
   ```shell
   # Port the IVR Tester's server should listen on
   export LOCAL_SERVER_PORT=8080
   # Public ngrok URL that forwards locally to the IVR Tester's server
   export PUBLIC_SERVER_URL=$(curl -s localhost:4040/api/tunnels | jq -r .tunnels[0].public_url)
   
   ts-node src/test.ts
   ```

## Writing tests

### Reducing flakiness

Automatically transcribing speech to text is not an accurate process, so you have to be careful about how you define 
your `when` clauses. A spoken sentence such as:

```
Please enter your date of birth
```

Could be transcribed as:

```
please entreat your date of birth
```

This introduces flakiness into your tests and puts importance on the balancing act of making your tests readable, whilst
being resilient to inaccuracies. In this example since being asked to **enter** your date of birth is important
to understanding the flow I would use `similarTo`, which matches based on a degree of similarity: 

```typescript
{
  when: similarTo("Please enter your date of birth"),
  then: press("18121985"),
}
```

Instead of say `contains` which would hide the fact a question is being asked to a casual observer of the test:

```typescript
{
  when: contains("date of birth"),
  then: press("18121985"),
}
```

## Development

### How to publish a release

1. Merge functionality to master along with an increase in the package's version
2. Create a release in GitHub - the version will be the package's version prefixed with 'v'

Creating the release with trigger the [GitHub workflow](./.github/workflows/on-release.yml) that will publish to npmjs.com
