import React, { createContext, useContext } from 'react';
import { calculateR, DEFAULT_EXPECTED_PARTICIPANTS } from '../utils/reactionUtils';

interface RoomContextValue {
  expectedParticipants: number;
  R: number;
}

const RoomContext = createContext<RoomContextValue>({
  expectedParticipants: DEFAULT_EXPECTED_PARTICIPANTS,
  R: calculateR(DEFAULT_EXPECTED_PARTICIPANTS),
});

export const RoomProvider: React.FC<{
  expectedParticipants?: number;
  children: React.ReactNode;
}> = ({ expectedParticipants = DEFAULT_EXPECTED_PARTICIPANTS, children }) => {
  const R = calculateR(expectedParticipants);
  return (
    <RoomContext.Provider value={{ expectedParticipants, R }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = (): RoomContextValue => {
  return useContext(RoomContext);
};
