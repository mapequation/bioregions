import { Container, Grid, Step } from 'semantic-ui-react';
import './App.css';

export default function App() {
  return (
    <>
      <Container as="header">
        <h1>Infomap Bioregions</h1>
      </Container>

      <Container textAlign="center">
        <Step.Group ordered>
          <Step active>
            <Step.Content>
              <Step.Title>Load data</Step.Title>
              <Step.Description></Step.Description>
            </Step.Content>
          </Step>
          <Step>
            <Step.Content>
              <Step.Title>Run Infomap</Step.Title>
              <Step.Description></Step.Description>
            </Step.Content>
          </Step>
          <Step>
            <Step.Content>
              <Step.Title>Explore Bioregions</Step.Title>
              <Step.Description></Step.Description>
            </Step.Content>
          </Step>
        </Step.Group>
      </Container>

      <Grid container as="main">
        <Grid.Column
          width={4}
          as="aside"
          style={{ border: 'solid 1px blue' }}
        ></Grid.Column>
        <Grid.Column
          width={12}
          style={{ border: 'solid 1px green' }}
        ></Grid.Column>
      </Grid>

      <Container as="footer">mapequation.org</Container>
    </>
  );
}
