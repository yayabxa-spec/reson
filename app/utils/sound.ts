import { createAudioPlayer } from "expo-audio";

const playSound = async (uri = ""): Promise<any> => {
  // if (!init) return;
  const player = createAudioPlayer(require("../../assets/ding-short.mp3"));
  player.play();
  return player;
};
export { playSound };
