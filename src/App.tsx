import _ from 'underscore';

import React from 'react';
import Button from '@material-ui/core/Button';
import Chip from '@material-ui/core/Chip';
import FormLabel from '@material-ui/core/FormLabel';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import {createMuiTheme, MuiThemeProvider} from '@material-ui/core/styles';

import './App.css';

import * as ROT from 'rot-js';
import Hex from 'rot-js/lib/display/hex';
import {DisplayOptions} from 'rot-js/lib/display/types';

import * as Boards from './component/Boards';
import * as Chits from './component/Chits';
import * as Coordinates from './component/Coordinates';
import * as Specifications from './component/Specifications';
import * as Tiles from './component/Tiles';
import * as Configuration from './component/Configuration';

class Cartesian2D {
  constructor(public x: number, public y: number) {}

  translate(d: Cartesian2D): Cartesian2D {
    return new Cartesian2D(this.x + d.x, this.y + d.y);
  }

  scale(factor: number): Cartesian2D {
    return new Cartesian2D(factor * this.x, factor * this.y);
  }

  diff(rhs: Cartesian2D): Cartesian2D {
    return new Cartesian2D(this.x - rhs.x, this.y - rhs.y);
  }
}

interface GeneratedBoardProps {
  board: Boards.Board
}

interface GeneratedBoardState {}

class GeneratedBoard extends React.Component<GeneratedBoardProps, GeneratedBoardState> {
  private canvasDivRef = React.createRef<HTMLDivElement>();

  render(): JSX.Element {
    const canvasDiv = this.canvasDivRef.current;
    if (!!canvasDiv) {
      canvasDiv.childNodes.forEach((child) => canvasDiv.removeChild(child));

      canvasDiv.appendChild(this.renderBoard());
    }

    return (<div id="generated-board-div" ref={this.canvasDivRef}/>);
  }

  renderBoard(): HTMLCanvasElement {
    const displayOptions = {
      layout: 'hex',
      fontSize: 16,
      fg: 'black',
      bg: 'navy',
      width: 30,
      height: 11,
      spacing: 5
    };
    const display = new ROT.Display(displayOptions as Partial<DisplayOptions>);
    console.log(`App.GeneratedBoard.canvas: display.options = ${JSON.stringify(display._options)}`);

    this.props.board.terrainTilesLayout.forEach((layout) => {
      GeneratedBoard.renderTerrain(display, layout);
    });

    window.requestAnimationFrame(() => {
      this.props.board.portTilesLayout.forEach((layout) => {
        GeneratedBoard.renderPort(display, layout);
      });
    });

    window.requestAnimationFrame(() => {
      this.props.board.fisheryTilesLayout.forEach((layout) => {
        GeneratedBoard.renderFishery(
            display,
            layout,
            !this.props.board.terrainTilesLayout.some((tl) => {
              return tl.coordinate.x === layout.coordinate.x && tl.coordinate.y === layout.coordinate.y;
            }));
      })
    });

    window.requestAnimationFrame(() => {
      this.props.board.riverLayout.forEach((layout) => {
        GeneratedBoard.renderRiver(
            display,
            layout,
            this.props.board.terrainTilesLayout.filter((tl) => {
              return tl.coordinate.x === layout.coordinate.x && tl.coordinate.y === layout.coordinate.y;
            })[0]);
      });
    });

    return display.getContainer() as HTMLCanvasElement;
  }

  static renderTerrain(display: ROT.Display, configuredTile: Configuration.Configuration) {
    const options = display._options;

    const label = configuredTile.tile === Tiles.UNKNOWN
        ? '?'
        : GeneratedBoard.chitsToString(configuredTile.chits);
    display.draw(
        configuredTile.coordinate.x,
        configuredTile.coordinate.y,
        label,
        GeneratedBoard.chitColor(configuredTile.tile, configuredTile.chits, options.fg),
        GeneratedBoard.tileColor(configuredTile.tile));
  }

  static renderPort(display: ROT.Display, configuredTile: Configuration.Configuration): void {
    const options = display._options;

    const hexSize = (display._backend as Hex)._hexSize;
    const hexCenter = GeneratedBoard.hexCenter(hexSize, configuredTile.coordinate.x, configuredTile.coordinate.y);

    const edgePositionStartPoint = _.partial(GeneratedBoard.edgePositionStartPoint, _, hexCenter, hexSize, options.border);

    const vertex0 = edgePositionStartPoint(configuredTile.coordinate.positions[0]);
    const vertex1 = edgePositionStartPoint((configuredTile.coordinate.positions[0] + 1) % 6);

    GeneratedBoard.renderPolygon(display, [
      hexCenter,
      vertex0,
      vertex1], GeneratedBoard.tileColor(configuredTile.tile));

    const offset = vertex1.translate(vertex0.diff(vertex1).scale(.5)).diff(hexCenter).scale(.6875);
    GeneratedBoard.renderText(
        display,
        options.fg,
        hexCenter.translate(offset),
        configuredTile.tile === Tiles.GENERIC_HARBOR ? '3:1' : '2:1');
  }

  static renderFishery(
      display: ROT.Display, configuredTile: Configuration.Configuration, inside: boolean) {
    const options = display._options;

    // These calculations copied from rot.js to help ensure consistency.
    const hexSize = (display._backend as Hex)._hexSize;
    const hexCenter = GeneratedBoard.hexCenter(hexSize, configuredTile.coordinate.x, configuredTile.coordinate.y);

    const edgePositionStartPoint = _.partial(GeneratedBoard.edgePositionStartPoint, _, hexCenter, hexSize, options.border);

    const vertex0 = edgePositionStartPoint(configuredTile.coordinate.positions[0]);
    const vertex1 = edgePositionStartPoint(configuredTile.coordinate.positions[1]);
    const vertex2 = edgePositionStartPoint((configuredTile.coordinate.positions[1] + 1) % 6);
    const offset = vertex1.diff(hexCenter).scale(inside ? -.5 : .5);

    GeneratedBoard.renderPolygon(display, [
      vertex0,
      vertex1,
      vertex2,
      vertex2.translate(offset),
      vertex1.translate(offset),
      vertex0.translate(offset)
    ], GeneratedBoard.tileColor(configuredTile.tile));

    GeneratedBoard.renderText(
        display,
        GeneratedBoard.chitColor(configuredTile.tile, configuredTile.chits, options.fg),
        vertex1.translate(offset.scale(.5 + (inside ? .0625 : -.0625))),
        GeneratedBoard.chitsToString(configuredTile.chits));
  }

  static renderRiver(
      display: ROT.Display,
      configuredTile: Configuration.Configuration,
      underlyingConfiguration: Configuration.Configuration) {
    const options = display._options;

    const hexSize = (display._backend as Hex)._hexSize;
    const hexCenter = GeneratedBoard.hexCenter(hexSize, configuredTile.coordinate.x, configuredTile.coordinate.y);

    const edgePositionStartPoint = _.partial(GeneratedBoard.edgePositionStartPoint, _, hexCenter, hexSize, options.border);

    const chitsExist = underlyingConfiguration.chits.odds() !== 0;

    const backgroundLuminance = GeneratedBoard.luminance(GeneratedBoard.tileColor(underlyingConfiguration.tile));
    const lakeColor = GeneratedBoard.tileColor(Tiles.LAKE);
    const seaColor = GeneratedBoard.tileColor(Tiles.SEA);
    const color = Math.abs(backgroundLuminance - GeneratedBoard.luminance(lakeColor)) > Math.abs(backgroundLuminance - GeneratedBoard.luminance(seaColor))
        ? GeneratedBoard.tileColor(Tiles.LAKE)
        : GeneratedBoard.tileColor(Tiles.SEA);

    configuredTile.coordinate.positions.forEach((position) => {
      const vertex0 = edgePositionStartPoint(position);
      const vertex1 = edgePositionStartPoint((position + 1) % 6);

      const midpoint = vertex0.translate(vertex1.diff(vertex0).scale(.5));

      GeneratedBoard.renderPolygon(
          display,
          [
            chitsExist
                ? hexCenter.translate(midpoint.diff(hexCenter).scale(.5))
                : hexCenter,
            midpoint],
          color,
          color);
    });
  }

  static hexCenter(hexSize: number, x: number, y: number) {
    return new Cartesian2D(
        (x + 1) * (hexSize * Math.sqrt(3) / 2),
        (y * 1.5 + 1) * hexSize);
  }

  static renderPolygon(display: ROT.Display, points: Cartesian2D[], fillColor: string, strokeColor ?: string): void {
    const canvas = display.getContainer() as HTMLCanvasElement;
    const context = canvas.getContext('2d') || new CanvasRenderingContext2D();
    const options = display._options;

    context.strokeStyle = strokeColor || options.fg;
    context.fillStyle = fillColor;
    context.lineWidth = 1;

    context.beginPath();

    context.moveTo(points[points.length - 1].x, points[points.length - 1].y);
    points.forEach((point) => context.lineTo(point.x, point.y));

    context.stroke();
    context.fill();
  }

  static renderText(display: ROT.Display, color: string, coordinate: Cartesian2D, text: string) {
    const canvas = display.getContainer() as HTMLCanvasElement;
    const context = canvas.getContext('2d') || new CanvasRenderingContext2D();
    const options = display._options;

    context.strokeStyle = options.fg;
    context.fillStyle = color;

    context.fillText(text, coordinate.x, coordinate.y);
  }

  static chitsToString(chits: Chits.Chits) {
    return chits.values.toString().replace(/,/g, ' ');
  }

  static edgePositionStartPoint(edgePosition: Coordinates.EdgePosition, hexCenter: Cartesian2D, hexSize: number, border: number): Cartesian2D {
    const spacingX = hexSize * Math.sqrt(3) / 2;

    return hexCenter.translate(new Cartesian2D(
        ([Coordinates.LEFT, Coordinates.TOP_LEFT].some((p) => p === edgePosition)
            ? -1
            : [Coordinates.TOP_RIGHT, Coordinates.BOTTOM_LEFT].some((p) => p === edgePosition)
                ? 0
                : 1)
        * (spacingX - border),
        ([Coordinates.TOP_RIGHT, Coordinates.RIGHT, Coordinates.TOP_LEFT].some((p) => p === edgePosition)
            ? -1
            : 1)
        * ([Coordinates.TOP_RIGHT, Coordinates.BOTTOM_LEFT].some((p) => p === edgePosition) ? 1 : .5) * hexSize + border));
  }

  static chitColor(tile: Tiles.Tile, chits: Chits.Chits, primaryColor: string): string {
    function secondaryColor(backgroundColor: string): string {
      const backgroundLuminance = GeneratedBoard.luminance(backgroundColor);

      return ['crimson', '#C70000', '#FF8C8C', '#FFD3D3']
          .reduce((max: [string, number], color: string): [string, number] => {
            const contrast = Math.abs(backgroundLuminance - GeneratedBoard.luminance(color));

            return contrast > max[1]
                ? [color, contrast]
                : max
          }, ['', 0])[0];
    }

    return chits.odds() < 5
        ? primaryColor
        : secondaryColor(GeneratedBoard.tileColor(tile));
  }

  static tileColor(tile: Tiles.Tile): string {
    switch (tile.type) {
      case Tiles.Type.UNKNOWN: {
        return 'white';
      }

      case Tiles.Type.DESERT: {
        return 'sandybrown';
      }

      case Tiles.Type.BRICK_HARBOR:
      case Tiles.Type.HILL:
      case Tiles.Type.QUARRY: {
        return 'firebrick';
      }

      case Tiles.Type.ORE_HARBOR:
      case Tiles.Type.MOUNTAIN: {
        return 'slategray';
      }

      case Tiles.Type.WOOL_HARBOR:
      case Tiles.Type.PASTURE:
      case Tiles.Type.CASTLE: {
        return 'lawngreen';
      }

      case Tiles.Type.GRAIN_HARBOR:
      case Tiles.Type.FIELD: {
        return 'wheat';
      }

      case Tiles.Type.LUMBER_HARBOR:
      case Tiles.Type.FOREST:
      case Tiles.Type.GLASSWORKS: {
        return 'forestgreen';
      }

      case Tiles.Type.GOLD:
      case Tiles.Type.GENERIC_HARBOR: {
        return 'gold';
      }

      case Tiles.Type.SEA: {
        return 'navy';
      }

      case Tiles.Type.FISHERY:
      case Tiles.Type.LAKE: {
        return 'aqua';
      }

      case Tiles.Type.SWAMP: {
        return 'darkkhaki';
      }

      default: {
        return 'black';
      }
    }
  }

  static luminance(color: string): number {
    const rgb = ROT.Color.fromString(color);

    return Math.sqrt(
        0.299 * Math.pow(rgb[0], 2)
        + 0.587 * Math.pow(rgb[1], 2)
        + 0.114 * Math.pow(rgb[2], 2));
  }
}

interface AppProps {}

interface AppState {
  openMenu: boolean,
  playerCount: string,

  useFishermenOfCatanVariant: boolean,
  SCEN: string,
  boardGenerator: Boards.BoardGenerator,
  board: Boards.Board
}

interface BoardSpecifications {
  [key: string]: {
    [key: string]: Specifications.Specification[]
  }
}

class App extends React.Component<AppProps, AppState> {
  constructor(props: Readonly<{}>) {
    super(props);

    this.state = {
      openMenu: false,
      playerCount: '3',

      useFishermenOfCatanVariant: false,
      SCEN: 'Base',
      boardGenerator: new Boards.BoardGenerator(Specifications.SPEC_3_4),
      board: new Boards.Board([])
    };
  }

  render(): JSX.Element {
    const theme = createMuiTheme({
      palette: {
        type: 'dark',
      },
      typography: {
        useNextVariants: true
      }
    });

    const boardSpecifications: BoardSpecifications = {
      'Base': {
        '3': [Specifications.SPEC_3_4, Specifications.SPEC_3_4_FISHERMEN],
        '4': [Specifications.SPEC_3_4, Specifications.SPEC_3_4_FISHERMEN],
        '5-6': [Specifications.SPEC_5_6, Specifications.SPEC_5_6_FISHERMEN],
        '7-8': [Specifications.SPEC_7_8, Specifications.SPEC_7_8_FISHERMEN]
      },
      'Seafarers: Heading for New Shores': {
        '3': [Specifications.SPEC_3_EXP_SEA_SCEN_HFNS, Specifications.SPEC_3_EXP_SEA_SCEN_HFNS_FISHERMEN],
        '4': [Specifications.SPEC_4_EXP_SEA_SCEN_HFNS, Specifications.SPEC_4_EXP_SEA_SCEN_HFNS_FISHERMEN],
        '5-6': [Specifications.SPEC_5_6_EXP_SEA_SCEN_HFNS, Specifications.SPEC_5_6_EXP_SEA_SCEN_HFNS_FISHERMEN],
        '7-8': [Specifications.SPEC_7_8_EXP_SEA_SCEN_HFNS, Specifications.SPEC_7_8_EXP_SEA_SCEN_HFNS_FISHERMEN]
      },
      'Seafarers: The Fog Islands': {
        '3': [Specifications.SPEC_3_EXP_SEA_SCEN_FI, Specifications.SPEC_3_EXP_SEA_SCEN_FI_FISHERMEN],
        '4': [Specifications.SPEC_4_EXP_SEA_SCEN_FI, Specifications.SPEC_4_EXP_SEA_SCEN_FI_FISHERMEN],
        '5-6': [Specifications.SPEC_5_6_EXP_SEA_SCEN_FI, Specifications.SPEC_5_6_EXP_SEA_SCEN_FI_FISHERMEN]
      },
      'Traders and Barbarians: Rivers of Catan': {
        '3': [Specifications.SPEC_3_4_EXP_TB_SCEN_ROC, Specifications.SPEC_3_4_EXP_TB_SCEN_ROC_FISHERMEN],
        '4': [Specifications.SPEC_3_4_EXP_TB_SCEN_ROC, Specifications.SPEC_3_4_EXP_TB_SCEN_ROC_FISHERMEN],
        '5-6': [Specifications.SPEC_5_6_EXP_TB_SCEN_ROC, Specifications.SPEC_5_6_EXP_TB_SCEN_ROC_FISHERMEN],
        '7-8': [Specifications.SPEC_7_8_EXP_TB_SCEN_ROC, Specifications.SPEC_7_8_EXP_TB_SCEN_ROC_FISHERMEN]
      },
      'Traders and Barbarians: Traders and Barbarians': {
        '3': [Specifications.SPEC_3_4_EXP_TB_SCEN_TB, Specifications.SPEC_3_4_EXP_TB_SCEN_TB_FISHERMEN],
        '4': [Specifications.SPEC_3_4_EXP_TB_SCEN_TB, Specifications.SPEC_3_4_EXP_TB_SCEN_TB_FISHERMEN],
        '5-6': [Specifications.SPEC_5_6_EXP_TB_SCEN_TB, Specifications.SPEC_5_6_EXP_TB_SCEN_TB_FISHERMEN]
      }
    };
    const SCENs = Object.keys(boardSpecifications);
    const playerCounts = Object.keys(boardSpecifications['Base']);

    return (
        <div className="App">
          <header className="App-body">
            <MuiThemeProvider theme={theme}>
              <Typography id="title" variant="h3">Setter for Catan</Typography>
              <FormLabel>Number of Players</FormLabel>
              <RadioGroup
                  id="player-counts"
                  aria-label="number-of-players"
                  name="number-of-players"
                  value={this.state.playerCount}
                  onChange={(event: any) => {
                    this.generateBoard(boardSpecifications, this.state.SCEN, event.target.value, this.state.useFishermenOfCatanVariant);
                  }}
                  row
              >
                {playerCounts.map((playerCount) => {
                  return (
                      <FormControlLabel
                          key={playerCount}
                          value={playerCount}
                          label={playerCount}
                          disabled={!boardSpecifications[this.state.SCEN].hasOwnProperty(playerCount)}
                          control={<Radio color="primary"/>}
                      />
                  );
                })}
              </RadioGroup>
              <Chip
                  variant={this.state.useFishermenOfCatanVariant ? "default" : "outlined"}
                  label="Fishermen of Catan"
                  color={this.state.useFishermenOfCatanVariant ? "primary" : "secondary"}
                  onClick={() => {
                    this.generateBoard(boardSpecifications, this.state.SCEN, this.state.playerCount, !this.state.useFishermenOfCatanVariant)
                  }}
              />
              <br/>
              <Tooltip title="Right click to change configuration.">
                <Button
                    id="generate-board-button"
                    variant="contained"
                    color="primary"
                    onClick={() => {
                      this.setState({
                        board: this.state.boardGenerator.generateBoard()
                      });
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      this.setState({
                        openMenu: true
                      });
                    }}
                >
                  <Typography variant="h4">Generate {this.state.SCEN}</Typography>
                </Button>
              </Tooltip>
              <Menu
                  id="SCENs"
                  anchorEl={document.getElementById('generate-board-button')}
                  open={this.state.openMenu}
                  onClose={() => {
                    this.setState({
                      openMenu: false
                    });
                  }}>
                {
                  SCENs.map((SCEN) => (
                      <MenuItem
                          key={SCEN}
                          disabled={!boardSpecifications[SCEN].hasOwnProperty(this.state.playerCount)}
                          onClick={() => {
                            this.generateBoard(boardSpecifications, SCEN, this.state.playerCount, this.state.useFishermenOfCatanVariant);
                          }}
                      >
                        {SCEN}
                      </MenuItem>
                  ))
                }
              </Menu>
              <GeneratedBoard board={this.state.board}/>
            </MuiThemeProvider>
          </header>
        </div>
    );
  }

  generateBoard(boardSpecifications: BoardSpecifications, SCEN: string, playerCount: string, useFishermenOfCatanVariant: boolean) {
    const boardGenerator = new Boards.BoardGenerator(
        boardSpecifications[SCEN][playerCount][useFishermenOfCatanVariant ? 1 : 0]);

    this.setState({
      openMenu: false,

      SCEN: SCEN,
      playerCount: playerCount,
      useFishermenOfCatanVariant: useFishermenOfCatanVariant,
      boardGenerator: boardGenerator,
      board: !this.state.board.isEmpty() ? boardGenerator.generateBoard() : this.state.board
    });
  }
}

export default App;
