const { db, schema } = require('./.output/server/_ssr/game-api-B1XlK6DW.mjs');

async function debugDatabase() {
  try {
    console.log("Connecting to database...");
    
    // Get current game
    const currentGame = await db.query.games.findFirst({
      orderBy: desc(schema.games.updatedAt),
    });
    
    if (currentGame) {
      console.log("Found game:", currentGame);
      
      // Get pieces
      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });
      
      console.log(`Found ${pieces.length} pieces:`);
      pieces.forEach(piece => {
        console.log(`  ${piece.color} ${piece.pieceType} at square ${piece.square}`);
      });
      
      // Check first few squares
      for (let i = 0; i < 20; i++) {
        const piece = pieces.find(p => p.square === i);
        if (piece) {
          console.log(`Square ${i}: ${piece.color} ${piece.pieceType}`);
        }
      }
      
    } else {
      console.log("No game found in database");
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

debugDatabase();