import mongoose from 'mongoose';
import Booking from '../booking/booking.model.js';
import Rating from '../rating/rating.model.js';
import Ride from './ride.model.js';
import ChatRoom from '../message/chatRoom.model.js';
import Message from '../message/message.model.js';
import { createNotificationService } from '../notification/notification.service.js';
import { io } from '../../app.js';
import User from '../auth/auth.model.js';


export const createRideService = async (
  userId,
  { startLocation, endLocation, departureTime, availableSeats, baggageType }
) => {
  const seatCount = 4; // fixed
  const available = Number(availableSeats) || 0;
  const selfBookedSeats = seatCount - available;

  if (selfBookedSeats < 1)
    throw new Error("You must keep at least one seat for yourself.");
  if (selfBookedSeats > seatCount)
    throw new Error("Invalid available seat count.");

  // GeoJSON injection
  startLocation.location = {
    type: "Point",
    coordinates: [startLocation.lng, startLocation.lat],
  };
  endLocation.location = {
    type: "Point",
    coordinates: [endLocation.lng, endLocation.lat],
  };

  // Create ride
  const ride = new Ride({
    creator: userId,
    startLocation,
    endLocation,
    departureTime,
    seatCount,
    bookedSeats: selfBookedSeats,
    baggageType,
    price: 0,
  });
  await ride.save();

  // Create chat room
  const chatRoom = await ChatRoom.create({
    ride: ride._id,
    name: `Ride to ${endLocation.address}`,
    isGroup: true,
    participants: [userId],
    description: `Group chat for ride from ${startLocation.address} to ${endLocation.address}`,
  });

  ride.chatRoom = chatRoom._id;
  await ride.save();

  // System message
  await Message.create({
    chatRoom: chatRoom._id,
    sender: userId,
    message:
      "Welcome to the ride! You're the only one here now. Others will join soon.",
    type: "system",
  });

  // Create multiple booking documents (one per seat)
  const bookingDocs = [];
  for (let i = 0; i < selfBookedSeats; i++) {
    bookingDocs.push({
      ride: ride._id,
      user: userId,
      seatBooked: 1,
      baggageType,
      status: "active",
      joinedAt: new Date(),
    });
  }
  await Booking.insertMany(bookingDocs);

  // Notify creator
  await createNotificationService({
    user: userId,
    type: "general",
    message: `Ride created successfully with ${available} available seat${available !== 1 ? "s" : ""}`,
    ride: ride._id,
  });

  // Populate ride + chatRoom
  const populatedRide = await Ride.findById(ride._id)
    .populate("creator", "_id name email phoneNumber profileImage")
    .populate({
      path: "chatRoom",
      select: "_id name participants",
      populate: {
        path: "participants",
        select: "_id name email profileImage phoneNumber",
      },
    });

  const populatedChatRoom = await ChatRoom.findById(chatRoom._id).populate(
    "participants",
    "_id name email profileImage phoneNumber"
  );

  // Emit real-time events
  io.to(userId.toString()).emit("notification", {
    type: "general",
    message: "Ride created successfully",
    ride: populatedRide,
  });

  io.to(userId.toString()).emit("chat_room_created", {
    chatRoom: populatedChatRoom,
  });

  io.emit("ride_created", {
    ride: populatedRide,
    creator: userId,
    chatRoom: chatRoom._id,
  });

  return { ride: populatedRide, chatRoom: populatedChatRoom };
};




// export const createRideService = async (
//   userId,
//   { startLocation, endLocation, departureTime, seatCount, baggageType }
// ) => {
//   if (seatCount < 1) throw new Error('Seat count must be at least 1');

//   // GeoJSON injection
//   startLocation.location = {
//     type: 'Point',
//     coordinates: [startLocation.lng, startLocation.lat]
//   };
//   endLocation.location = {
//     type: 'Point',
//     coordinates: [endLocation.lng, endLocation.lat]
//   };

//   // Create ride
//   const ride = new Ride({
//     creator: userId,
//     startLocation,
//     endLocation,
//     departureTime,
//     seatCount,
//     bookedSeats: 1,
//     baggageType,
//     price: 0
//   });
//   await ride.save();

//   // Create chat room
//   const chatRoom = await ChatRoom.create({
//     ride: ride._id,
//     name: `Ride to ${endLocation.address}`,
//     isGroup: true,
//     participants: [userId],
//     description: `Group chat for ride from ${startLocation.address} to ${endLocation.address}`
//   });

//   ride.chatRoom = chatRoom._id;
//   await ride.save();

//   // System welcome message
//   await Message.create({
//     chatRoom: chatRoom._id,
//     sender: userId,
//     message: "Welcome to the ride! You're the only one here now. Others will join soon.",
//     type: "system"
//   });

//   // Initial booking
//   await Booking.create({
//     ride: ride._id,
//     user: userId,
//     seatBooked: 1,
//     baggageType,
//     status: 'active',
//     joinedAt: new Date()
//   });

//   // Notify creator in DB
//   await createNotificationService({
//     user: userId,
//     type: 'general',
//     message: 'Ride created successfully',
//     ride: ride._id
//   });

//   // Populate ride + chatRoom
//   const populatedRide = await Ride.findById(ride._id)
//     .populate("creator", "_id name email phoneNumber profileImage")
//     .populate({
//       path: "chatRoom",
//       select: "_id name participants",
//       populate: {
//         path: "participants",
//         select: "_id name email profileImage phoneNumber"
//       }
//     });

//   const populatedChatRoom = await ChatRoom.findById(chatRoom._id)
//     .populate("participants", "_id name email profileImage phoneNumber");

//   // Emit real-time events
//   //Send notification to all participants that they were added to the ride using io
//   io.to(userId.toString()).emit("notification", {
//     type: "general",
//     message: "Ride created successfully",
//     ride: populatedRide
//   });


//   // Send Chat room instance also to all participants using io
//   io.to(userId.toString()).emit("chat_room_created", {
//     chatRoom: populatedChatRoom
//   });

//   io.emit("ride_created", {
//     ride: populatedRide,
//     creator: userId,
//     chatRoom: chatRoom._id
//   });

//   return { ride: populatedRide, chatRoom: populatedChatRoom };
// };


// export const createRideService = async (
//   userId,
//   { startLocation, endLocation, departureTime, seatCount, baggageType }
// ) => {
//   if (seatCount < 1) throw new Error('Seat count must be at least 1');

//   // Inject GeoJSON into location fields
//   startLocation.location = {
//     type: 'Point',
//     coordinates: [startLocation.lng, startLocation.lat]
//   };

//   endLocation.location = {
//     type: 'Point',
//     coordinates: [endLocation.lng, endLocation.lat]
//   };

//   const ride = new Ride({
//     creator: userId,
//     startLocation,
//     endLocation,
//     departureTime,
//     seatCount,
//     bookedSeats: 1,
//     baggageType,
//     price: 0
//   });

//   await ride.save();

//   // ChatRoom creation
//   const chatRoom = await ChatRoom.create({
//     ride: ride._id,
//     name: `Ride to ${endLocation.address}`,
//     isGroup: true,
//     participants: [userId],
//     description: `Group chat for ride from ${startLocation.address} to ${endLocation.address}`
//   });

//   ride.chatRoom = chatRoom._id;
//   await ride.save();

//   // System welcome message
//   await Message.create({
//     chatRoom: chatRoom._id,
//     sender: userId,
//     message: "Welcome to the ride! You're the only one here now. Others will join soon.",
//     type: "system"
//   });

//   // Initial booking
//   await Booking.create({
//     ride: ride._id,
//     user: userId,
//     seatBooked: 1,
//     baggageType: 'Suitcase',
//     status: 'active',
//     joinedAt: new Date()
//   });

//   // Emit ride_created event
//   io.emit('ride_created', {
//     ride: ride._id,
//     creator: userId,
//     chatRoom: chatRoom._id
//   });

//   // Notify creator
//   await createNotificationService({
//     user: userId,
//     type: 'general',
//     message: 'Ride created successfully',
//     ride: ride._id
//   });

//   // Populate creator + chatRoom.participants
//   const populatedRide = await Ride.findById(ride._id)
//     .populate("creator", "_id name email phoneNumber profileImage")
//     .populate({
//       path: "chatRoom",
//       select: "_id name participants",
//       populate: {
//         path: "participants",
//         select: "_id name email profileImage phoneNumber"
//       }
//     });

//     // Send notification to the all participants that they were added to the ride using io


//     // Send Chat room instance also to the all participants using io

//   // Also populate the chatRoom object we return
//   const populatedChatRoom = await ChatRoom.findById(chatRoom._id)
//     .populate("participants", "_id name email profileImage phoneNumber");

//   return { ride: populatedRide, chatRoom: populatedChatRoom };
// };



export const seeRideService = async (rideId) => {
  const ride = await Ride.findById(rideId)
    .populate("creator", "_id name email profileImage")
    .populate({
      path: "chatRoom",
      populate: {
        path: "participants",
        select: "_id name email profileImage phoneNumber",
      },
    })
    .lean();

  if (!ride) throw new Error("Ride not found");

  // Fetch bookings (only active + completed)
  const bookings = await Booking.find({
    ride: rideId,
    status: { $in: ["active", "completed"] }
  })
    .populate("user", "name profileImage email")
    .lean();

  // Collect all userIds
  const participantIds = bookings.map((b) => b.user._id);

  // Ratings
  const ratings = await Rating.aggregate([
    {
      $match: {
        ride: new mongoose.Types.ObjectId(rideId),
        ratedUser: { $in: participantIds },
      },
    },
    {
      $group: {
        _id: "$ratedUser",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const ratingMap = {};
  ratings.forEach((r) => {
    ratingMap[r._id.toString()] = {
      avgRating: r.avgRating.toFixed(1),
      ratingCount: r.count,
    };
  });

  // Participants (only active & completed)
  const participants = bookings.map((b) => ({
    seatBooked: b.seatBooked,
    baggageType: b.baggageType,
    avgRating: ratingMap[b.user._id.toString()]
      ? Number(ratingMap[b.user._id.toString()].avgRating)
      : 0,
    userId: b.user._id,
    name: b.user.name,
    profileImage: b.user.profileImage || "",
    status: b.status // include booking status if needed
  }));

  return {
    ...ride,
    participants,
    participantsCount: participants.length,
  };
};





// Utility to calculate Haversine distance (in meters)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// to find correct direction of the ride
// bearing calculation based on start and end coordinates
function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}


// angle difference between two bearings
function bearingDiff(b1, b2) {
  const diff = Math.abs(b1 - b2);
  return diff > 180 ? 360 - diff : diff;
}



export const filterRidesService = async (query) => {
  const {
    fromLat,
    fromLng,
    toLat,
    toLng,
    departureTime,
    departureFlexMinutes = 15,
    departureFlexKm = 0.2,
    arrivalFlexKm = 0.2,
    passengers = 1,
    page = 1,
    limit = 10
  } = query;

  const currentPage = parseInt(page);
  const pageSize = parseInt(limit);

  const pipeline = [];

  // CASE 1: Filter mode (with geo + time + seat filter)
  if (fromLat && fromLng && toLat && toLng && departureTime) {
    const parsedDeparture = new Date(departureTime);
    if (isNaN(parsedDeparture)) {
      throw new Error("Invalid departureTime format. Use ISO 8601");
    }

    const timeMin = new Date(parsedDeparture.getTime() - departureFlexMinutes * 60000);
    const timeMax = new Date(parsedDeparture.getTime() + departureFlexMinutes * 60000);
    const departureMaxDistance = parseFloat(departureFlexKm) * 1000;

    pipeline.push({
    $geoNear: {
      near: { type: "Point", coordinates: [parseFloat(fromLng), parseFloat(fromLat)] },
      distanceField: "startLocation.distance",
      maxDistance: departureMaxDistance,
      spherical: true,
      key: "startLocation.location",
      query: {
        status: "active",
        $expr: { $gte: [{ $subtract: ["$seatCount", "$bookedSeats"] }, parseInt(passengers)] },
        $and: [
          { departureTime: { $gte: new Date() } },        
          { departureTime: { $gte: timeMin } },
          { departureTime: { $lte: timeMax } }
        ]
      }
    }

    });
  } else {
    // CASE 2: All rides (no geo filter, just active rides)
    pipeline.push({
      $match: {
        status: "active",
        departureTime: { $gte: new Date() } // only today and future rides
      }
    });
  }

  // Common lookups
  pipeline.push(
    {
      $lookup: {
        from: "bookings",
        let: { rideId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$ride", "$$rideId"] }, status: { $in: ["active"] } } },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "user"
            }
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "ratings",
              let: { participantId: "$user._id" },
              pipeline: [
                { $match: { $expr: { $eq: ["$ratedUser", "$$participantId"] } } },
                { $group: { _id: null, avgRating: { $avg: "$rating" } } }
              ],
              as: "ratingData"
            }
          },
          {
            $addFields: {
              avgRating: { $ifNull: [{ $arrayElemAt: ["$ratingData.avgRating", 0] }, 0] }
            }
          },
          {
            $project: {
              _id: 0,
              userId: "$user._id",
              name: "$user.name",
              profileImage: "$user.profileImage",
              baggageType: 1,
              seatBooked: 1,
              avgRating: 1
            }
          }
        ],
        as: "bookings"
      }
    },
    { $addFields: { participants: "$bookings", participantsCount: { $size: "$bookings" } } },
    { $project: { bookings: 0 } }
  );

  // 🔹 Add creator
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "creator",
        foreignField: "_id",
        as: "creator"
      }
    },
    { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } }
  );

  // 🔹 Add chatRoom + its participants
  pipeline.push(
    {
      $lookup: {
        from: "chatrooms",
        localField: "chatRoom",
        foreignField: "_id",
        as: "chatRoom"
      }
    },
    { $unwind: { path: "$chatRoom", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "chatRoom.participants",
        foreignField: "_id",
        as: "chatRoom.participants"
      }
    }
  );

  // 🔹 Final projection
  pipeline.push({
    $project: {
      startLocation: 1,
      endLocation: 1,
      departureTime: 1,
      seatCount: 1,
      bookedSeats: 1,
      participants: 1,
      participantsCount: 1,
      status: 1,
      creator: {
        _id: "$creator._id",
        name: "$creator.name",
        email: "$creator.email",
        profileImage: "$creator.profileImage"
      },
      chatRoom: {
        _id: "$chatRoom._id",
        name: "$chatRoom.name",
        participants: {
          _id: 1,
          name: 1,
          email: 1,
          profileImage: 1
        }
      }
    }
  });

  const rides = await Ride.aggregate(pipeline);

  // If filter mode → apply arrival + direction check
  let filtered = rides;
  if (fromLat && fromLng && toLat && toLng && departureTime) {
    const arrivalMaxDistance = parseFloat(arrivalFlexKm) * 1000;
    const userBearing = calculateBearing(fromLat, fromLng, toLat, toLng);

    filtered = rides.filter((ride) => {
      const end = ride.endLocation;
      const distance = haversineDistance(toLat, toLng, end.lat, end.lng);
      const rideBearing =
        ride.bearing ??
        calculateBearing(ride.startLocation.lat, ride.startLocation.lng, end.lat, end.lng);
      const directionOK = bearingDiff(userBearing, rideBearing) <= 45;
      return distance <= arrivalMaxDistance && directionOK;
    });
  }

  // Sorting + pagination
  const sorted = filtered.sort((a, b) => a.departureTime - b.departureTime);
  const totalData = sorted.length;
  const totalPages = Math.ceil(totalData / pageSize);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return {
    rides: paginated,
    pagination: {
      currentPage,
      totalPages,
      totalData,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    }
  };
};










// export const filterRidesService = async (query) => {
//   const {
//     fromLat,
//     fromLng,
//     toLat,
//     toLng,
//     departureTime,
//     departureFlexMinutes = 15,
//     departureFlexKm = 0.2,
//     arrivalFlexKm = 0.2,
//     passengers = 1,
//     page = 1,
//     limit = 10
//   } = query;

//   if (!fromLat || !fromLng || !toLat || !toLng || !departureTime) {
//     throw new Error('Missing required parameters: fromLat, fromLng, toLat, toLng, or departureTime');
//   }

//   const parsedDeparture = new Date(departureTime);
//   if (isNaN(parsedDeparture)) {
//     throw new Error('Invalid departureTime format. Use ISO 8601');
//   }

//   const timeMin = new Date(parsedDeparture.getTime() - departureFlexMinutes * 60000);
//   const timeMax = new Date(parsedDeparture.getTime() + departureFlexMinutes * 60000);

//   const departureMaxDistance = parseFloat(departureFlexKm) * 1000;
//   const arrivalMaxDistance = parseFloat(arrivalFlexKm) * 1000;

//   const userBearing = calculateBearing(fromLat, fromLng, toLat, toLng);

//   const rides = await Ride.find({
//     status: 'active',
//     departureTime: { $gte: timeMin, $lte: timeMax },
//     $expr: {
//       $gte: [{ $subtract: ['$seatCount', '$bookedSeats'] }, parseInt(passengers)]
//     },
//     'startLocation.location': {
//       $near: {
//         $geometry: {
//           type: 'Point',
//           coordinates: [parseFloat(fromLng), parseFloat(fromLat)]
//         },
//         $maxDistance: departureMaxDistance
//       }
//     }
//   })
//     .populate("creator", "_id name email phoneNumber profileImage")
//     .populate({
//       path: "chatRoom",
//       select: "_id name participants",
//       populate: {
//         path: "participants",
//         select: "_id name email profileImage phoneNumber"
//       }
//     });

//   const filtered = rides.filter(ride => {
//     const end = ride.endLocation;
//     const distance = haversineDistance(toLat, toLng, end.lat, end.lng);
//     const rideBearing = ride.bearing ?? calculateBearing(
//       ride.startLocation.lat,
//       ride.startLocation.lng,
//       end.lat,
//       end.lng
//     );
//     const directionOK = bearingDiff(userBearing, rideBearing) <= 45;

//     return distance <= arrivalMaxDistance && directionOK;
//   });

//   // Sort by departureTime
//   const sorted = filtered.sort((a, b) => a.departureTime - b.departureTime);

//   // Pagination calculation
//   const currentPage = parseInt(page);
//   const pageSize = parseInt(limit);
//   const totalData = sorted.length;
//   const totalPages = Math.ceil(totalData / pageSize);
//   const start = (currentPage - 1) * pageSize;
//   const paginated = sorted.slice(start, start + pageSize);

//   return {
//     rides: paginated,
//     pagination: {
//       currentPage,
//       totalPages,
//       totalData,
//       hasNextPage: currentPage < totalPages,
//       hasPrevPage: currentPage > 1
//     }
//   };
// };


export const updateRideService = async (rideId, userId, updates) => {
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, creator: userId, status: 'active' },
    updates,
    { new: true }
  );
  if (!ride) throw new Error('Ride not found or not authorized to update');
  return ride;
};


export const softDeleteRideService = async (rideId, userId) => {
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, creator: userId, status: 'active' },
    { deletedByCreator: true, status: 'cancelled' },
    { new: true }
  );
  if (!ride) throw new Error('Ride not found or not authorized to delete');
  return ride;
};


export const joinRideService = async (rideId, userId, { seatBooked = 1, baggageType }) => {
  // Find the ride
  const ride = await Ride.findById(rideId).populate('chatRoom');
  if(!ride) throw new Error("Ride is not found!");
  if(ride.departureTime < new Date()) throw new Error("Sorry, ride departure time has passed! Cannot process join-request.");

  // Check available seats
  if (ride.bookedSeats + seatBooked > ride.seatCount) {
    throw new Error('Not enough seats available');
  }

  // Create multiple booking records (1 per seat)
  const bookings = [];
  for (let i = 0; i < seatBooked; i++) {
    const booking = await Booking.create({
      ride: rideId,
      user: userId,
      seatBooked: 1,
      baggageType,
      status: 'active',
      joinedAt: new Date()
    });
    bookings.push(booking);
  }

  // Update total booked seats
  ride.bookedSeats += seatBooked;
  await ride.save();

  await createNotificationService({
    user: userId,
    type: 'join',
    ride: rideId,
    message: 'You successfully joined the ride'
  });

  // --- USER + RATING FETCH ---
  const joinedUser = await User.findById(userId).select('name profileImage').lean();

  const rating = await Rating.aggregate([
    {
      $match: {
        ride: new mongoose.Types.ObjectId(rideId),
        ratedUser: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $group: {
        _id: '$ratedUser',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 }
      }
    }
  ]);

  // --- SOCKET & CHAT SECTION ---
  if (ride.chatRoom) {
    const chatRoom = await ChatRoom.findById(ride.chatRoom);
    if (chatRoom) {
      const alreadyParticipant = chatRoom.participants.some(
        id => id.toString() === userId.toString()
      );

      // Add participant if not already in chat room
      if (!alreadyParticipant) {
        chatRoom.participants.push(userId);
        await chatRoom.save();

        // Create system message
        await Message.create({
          chatRoom: ride.chatRoom._id,
          sender: userId,
          message: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`,
          type: "system"
        });
      }
    }
  }

  // --- NOTIFICATIONS ---
  if (!ride.creator.equals(userId)) {
    await createNotificationService({
      user: ride.creator,
      type: 'join',
      ride: rideId,
      message: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`
    });
  }

  const avgRating = rating.length > 0 ? Number(rating[0].avgRating.toFixed(1)) : 0;

  // --- PARTICIPANTS PAYLOAD ---
  const participants = bookings.map(() => ({
    userId,
    name: joinedUser.name,
    profileImage: joinedUser.profileImage || '',
    seatBooked: 1,
    baggageType,
    avgRating
  }));

  // --- SOCKET EMITS ---
  // console.log("ride.chatRoom ", ride.chatRoom);

  if (ride.chatRoom._id) {
    // console.log(`room-${ride.chatRoom._id.toString()}`);

    // console.log(JSON.stringify({
    //   type: 'system',
    //   text: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`,
    //   createdAt: new Date()
    // }));

    io.to(`room-${ride.chatRoom._id.toString()}`).emit('userJoined', { participants });

    io.to(`room-${ride.chatRoom._id.toString()}`).emit('newMessage', {
      type: 'system',
      text: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`,
      createdAt: new Date()
    });
  }

  // Emit global ride update 
  io.emit('ride_joined', { ride: rideId, user: userId, seatBooked, baggageType });

  // --- RESPONSE BUILD ---
  const bookingWithRide = await Booking.findById(bookings[0]._id).populate({
    path: 'ride',
    populate: [
      { path: 'creator', select: 'name email profileImage' },
      {
        path: 'chatRoom',
        populate: {
          path: 'participants',
          select: 'name email profileImage phoneNumber'
        }
      }
    ]
  });

  const bookingObj = bookingWithRide.toObject();

  return {
    ...bookingObj,
    ride: {
      ...bookingObj.ride,
      participants,
      participantsCount: participants.length
    }
  };
};


// from join chatgpt with optional improvement service

// export const joinRideService = async (rideId, userId, { seatBooked = 1, baggageType }) => {
//   // Find the ride
//   const ride = await Ride.findById(rideId).populate('chatRoom');
//   if (!ride || ride.status !== 'active') throw new Error('Ride not available');

//   // Check available seats
//   if (ride.bookedSeats + seatBooked > ride.seatCount) {
//     throw new Error('Not enough seats available');
//   }

//   // Create multiple booking records (1 per seat)
//   const bookings = [];
//   for (let i = 0; i < seatBooked; i++) {
//     const booking = await Booking.create({
//       ride: rideId,
//       user: userId,
//       seatBooked: 1,
//       baggageType,
//       status: 'active',
//       joinedAt: new Date()
//     });
//     bookings.push(booking);
//   }

//   // Update total booked seats
//   ride.bookedSeats += seatBooked;
//   await ride.save();

//   // --- SOCKET & CHAT SECTION ---
//   if (ride.chatRoom) {
//     const chatRoom = await ChatRoom.findById(ride.chatRoom);
//     if (chatRoom) {
//       const alreadyParticipant = chatRoom.participants.some(
//         id => id.toString() === userId.toString()
//       );

//       // Add participant if not already in chat room
//       if (!alreadyParticipant) {
//         chatRoom.participants.push(userId);
//         await chatRoom.save();

//         // Create system message
//         await Message.create({
//           chatRoom: ride.chatRoom,
//           sender: userId,
//           message: `A new passenger joined the ride`,
//           type: "system"
//         });
//       }
//     }
//   }

//   // --- NOTIFICATIONS ---
//   if (!ride.creator.equals(userId)) {
//     await createNotificationService({
//       user: ride.creator,
//       type: 'join',
//       ride: rideId,
//       message: 'A new passenger joined your ride'
//     });
//   }

//   await createNotificationService({
//     user: userId,
//     type: 'join',
//     ride: rideId,
//     message: 'You successfully joined the ride'
//   });

//   // --- USER + RATING FETCH ---
//   const joinedUser = await User.findById(userId).select('name profileImage').lean();

//   const rating = await Rating.aggregate([
//     {
//       $match: {
//         ride: new mongoose.Types.ObjectId(rideId),
//         ratedUser: new mongoose.Types.ObjectId(userId)
//       }
//     },
//     {
//       $group: {
//         _id: '$ratedUser',
//         avgRating: { $avg: '$rating' },
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   const avgRating = rating.length > 0 ? Number(rating[0].avgRating.toFixed(1)) : 0;

//   // --- PARTICIPANTS PAYLOAD ---
//   const participants = bookings.map(() => ({
//     userId,
//     name: joinedUser.name,
//     profileImage: joinedUser.profileImage || '',
//     seatBooked: 1,
//     baggageType,
//     avgRating
//   }));

//   // --- SOCKET EMITS ---
//   if (ride.chatRoom) {
//     const chatRoomTarget = `room-${ride.chatRoom}`;
//     const rideRoomTarget = `ride-${rideId}`;

//     const payload = {
//       participants,
//       rideId,
//       userId,
//       name: joinedUser.name,
//       seatBooked,
//       baggageType,
//       createdAt: new Date()
//     };

//     // Emit to chat room
//     io.to(chatRoomTarget).emit('userJoined', payload);
//     io.to(chatRoomTarget).emit('newMessage', {
//       type: 'system',
//       text: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`,
//       createdAt: new Date()
//     });

//     // Emit also to ride-level room (optional improvement)
//     io.to(rideRoomTarget).emit('userJoined', payload);
//     io.to(rideRoomTarget).emit('newMessage', {
//       type: 'system',
//       text: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`,
//       createdAt: new Date()
//     });

//     console.log(`Emitted userJoined to ${chatRoomTarget} and ${rideRoomTarget}`);
//   }

//   // Emit global ride update
//   io.emit('ride_joined', { ride: rideId, user: userId, seatBooked, baggageType });

//   // --- RESPONSE BUILD ---
//   const bookingWithRide = await Booking.findById(bookings[0]._id).populate({
//     path: 'ride',
//     populate: [
//       { path: 'creator', select: 'name email profileImage' },
//       {
//         path: 'chatRoom',
//         populate: {
//           path: 'participants',
//           select: 'name email profileImage phoneNumber'
//         }
//       }
//     ]
//   });

//   const bookingObj = bookingWithRide.toObject();

//   return {
//     ...bookingObj,
//     ride: {
//       ...bookingObj.ride,
//       participants,
//       participantsCount: participants.length
//     }
//   };
// };


// working join version

// export const joinRideService = async (rideId, userId, { seatBooked = 1, baggageType }) => {
//   // Find the ride
//   const ride = await Ride.findById(rideId).populate('chatRoom');
//   if (!ride || ride.status !== 'active') throw new Error('Ride not available');

//   // Check available seats
//   if (ride.bookedSeats + seatBooked > ride.seatCount) {
//     throw new Error('Not enough seats available');
//   }

//   // Create multiple booking records (1 per seat)
//   const bookings = [];
//   for (let i = 0; i < seatBooked; i++) {
//     const booking = await Booking.create({
//       ride: rideId,
//       user: userId,
//       seatBooked: 1,
//       baggageType,
//       status: 'active',
//       joinedAt: new Date()
//     });
//     bookings.push(booking);
//   }

//   // Update total booked seats
//   ride.bookedSeats += seatBooked;
//   await ride.save();

//   // --- SOCKET & CHAT SECTION ---
//   if (ride.chatRoom) {
//     const chatRoom = await ChatRoom.findById(ride.chatRoom);
//     if (chatRoom) {
//       const alreadyParticipant = chatRoom.participants.some(
//         id => id.toString() === userId.toString()
//       );

//       // Add participant if not already in chat room
//       if (!alreadyParticipant) {
//         chatRoom.participants.push(userId);
//         await chatRoom.save();

//         // Create system message
//         await Message.create({
//           chatRoom: ride.chatRoom,
//           sender: userId,
//           message: `A new passenger joined the ride`,
//           type: "system"
//         });
//       }
//     }
//   }

//   // --- NOTIFICATIONS ---
//   if (!ride.creator.equals(userId)) {
//     await createNotificationService({
//       user: ride.creator,
//       type: 'join',
//       ride: rideId,
//       message: 'A new passenger joined your ride'
//     });
//   }

//   await createNotificationService({
//     user: userId,
//     type: 'join',
//     ride: rideId,
//     message: 'You successfully joined the ride'
//   });

//   // --- USER + RATING FETCH ---
//   const joinedUser = await User.findById(userId).select('name profileImage').lean();

//   const rating = await Rating.aggregate([
//     {
//       $match: {
//         ride: new mongoose.Types.ObjectId(rideId),
//         ratedUser: new mongoose.Types.ObjectId(userId)
//       }
//     },
//     {
//       $group: {
//         _id: '$ratedUser',
//         avgRating: { $avg: '$rating' },
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   const avgRating = rating.length > 0 ? Number(rating[0].avgRating.toFixed(1)) : 0;

//   // --- PARTICIPANTS PAYLOAD ---
//   const participants = bookings.map(() => ({
//     userId,
//     name: joinedUser.name,
//     profileImage: joinedUser.profileImage || '',
//     seatBooked: 1,
//     baggageType,
//     avgRating
//   }));

//   // --- SOCKET EMITS ---
//   if (ride.chatRoom) {
//     io.to(`room-${ride.chatRoom}`).emit('userJoined', { participants });

//     io.to(`room-${ride.chatRoom}`).emit('newMessage', {
//       type: 'system',
//       text: `${joinedUser.name} joined the ride (${seatBooked} seat${seatBooked > 1 ? 's' : ''})`,
//       createdAt: new Date()
//     });
//   }

//   // Emit global ride update 
//   io.emit('ride_joined', { ride: rideId, user: userId, seatBooked, baggageType });

//   // --- RESPONSE BUILD ---
//   const bookingWithRide = await Booking.findById(bookings[0]._id).populate({
//     path: 'ride',
//     populate: [
//       { path: 'creator', select: 'name email profileImage' },
//       {
//         path: 'chatRoom',
//         populate: {
//           path: 'participants',
//           select: 'name email profileImage phoneNumber'
//         }
//       }
//     ]
//   });

//   const bookingObj = bookingWithRide.toObject();

//   return {
//     ...bookingObj,
//     ride: {
//       ...bookingObj.ride,
//       participants,
//       participantsCount: participants.length
//     }
//   };
// };



// export const joinRideService = async (rideId, userId, { seatBooked = 1, baggageType }) => {
//   const ride = await Ride.findById(rideId).populate('chatRoom');
//   if (!ride || ride.status !== 'active') throw new Error('Ride not available');

//   if (ride.bookedSeats + seatBooked > ride.seatCount) {
//     throw new Error('Not enough seats available');
//   }

//   // Create multiple booking records (1 per seat)
//   const bookings = [];
//   for (let i = 0; i < seatBooked; i++) {
//     const booking = await Booking.create({
//       ride: rideId,
//       user: userId,
//       seatBooked: 1,
//       baggageType,
//       status: 'active',
//       joinedAt: new Date()
//     });
//     bookings.push(booking);
//   }

//   // Update total booked seats
//   ride.bookedSeats += seatBooked;
//   await ride.save();

//   // Add user to chat room if exists
//   if (ride.chatRoom) {
//     const chatRoom = await ChatRoom.findById(ride.chatRoom);
//     if (chatRoom) {
//       const alreadyParticipant = chatRoom.participants.some(
//         id => id.toString() === userId.toString()
//       );
//       if (!alreadyParticipant) {
//         chatRoom.participants.push(userId);
//         await chatRoom.save();

//         await Message.create({
//           chatRoom: ride.chatRoom,
//           sender: userId,
//           message: `A new passenger joined the ride`,
//           type: "system"
//         });

//         io.to(`room-${ride.chatRoom}`).emit('userJoined', { 
//           roomId: ride.chatRoom, 
//           userId,
//           rideId
//         });
//       }
//     }
//   }

//   // Emit event
//   io.emit('ride_joined', { ride: rideId, user: userId, seatBooked, baggageType });

//   // Notifications
//   if (!ride.creator.equals(userId)) {
//     await createNotificationService({
//       user: ride.creator,
//       type: 'join',
//       ride: rideId,
//       message: 'A new passenger joined your ride'
//     });
//   }

//   await createNotificationService({
//     user: userId,
//     type: 'join',
//     ride: rideId,
//     message: 'You successfully joined the ride'
//   });

//   // Fetch joined user with rating
//   const joinedUser = await User.findById(userId).select('name profileImage').lean();

//   const rating = await Rating.aggregate([
//     { $match: { ride: new mongoose.Types.ObjectId(rideId), ratedUser: new mongoose.Types.ObjectId(userId) } },
//     { $group: { _id: '$ratedUser', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
//   ]);

//   const avgRating = rating.length > 0 ? Number(rating[0].avgRating.toFixed(1)) : 0;

//   // Format participants — one entry per seat booked
//   const participants = bookings.map(() => ({
//     userId,
//     name: joinedUser.name,
//     profileImage: joinedUser.profileImage || '',
//     seatBooked: 1,
//     baggageType,
//     avgRating
//   }));

//   // Populate final booking with ride + chatroom for consistency
//   const bookingWithRide = await Booking.findById(bookings[0]._id).populate({
//     path: 'ride',
//     populate: [
//       { path: 'creator', select: 'name email profileImage' },
//       {
//         path: 'chatRoom',
//         populate: {
//           path: 'participants',
//           select: 'name email profileImage phoneNumber'
//         }
//       }
//     ]
//   });

//   const bookingObj = bookingWithRide.toObject();

//   return {
//     ...bookingObj,
//     ride: {
//       ...bookingObj.ride,
//       participants,
//       participantsCount: participants.length
//     }
//   };
// };




// export const joinRideService = async (rideId, userId, { baggageType }) => {
//   const seatBooked = 1;

//   const ride = await Ride.findById(rideId).populate('chatRoom');
//   if (!ride || ride.status !== 'active') throw new Error('Ride not available');

//   if (ride.bookedSeats + seatBooked > ride.seatCount) {
//     throw new Error('Not enough seats available');
//   }

//   const booking = await Booking.create({
//     ride: rideId,
//     user: userId,
//     seatBooked,
//     baggageType,
//     status: 'active',
//     joinedAt: new Date()
//   });

//   ride.bookedSeats += seatBooked;
//   await ride.save();

//   // Add user to chat room if it exists
//   if (ride.chatRoom) {
//     const chatRoom = await ChatRoom.findById(ride.chatRoom);
//     if (!chatRoom) {
//       console.error('Chat room not found for ride:', ride.chatRoom);
//     } else {
//       // Use .some for ObjectId comparison
//       const alreadyParticipant = chatRoom.participants.some(
//         id => id.toString() === userId.toString()
//       );
//       if (!alreadyParticipant) {
//         chatRoom.participants.push(userId);
//         try {
//           await chatRoom.save();
//           // console.log('Added user to chat room:', userId, 'ChatRoom:', chatRoom._id);
//         } catch (err) {
//           console.error('Error saving chat room:', err);
//         }

//         try {
//           await Message.create({
//             chatRoom: ride.chatRoom,
//             sender: userId,
//             message: `A new passenger joined the ride`,
//             type: "system"
//           });
//           console.log('System message created for chat room:', ride.chatRoom);
//         } catch (err) {
//           console.error('Error creating system message:', err);
//         }

//         io.to(`room-${ride.chatRoom}`).emit('userJoined', { 
//           roomId: ride.chatRoom, 
//           userId: userId,
//           rideId: rideId 
//         });
//       } else {
//         console.log('User already a participant:', userId);
//       }
//     }
//   } else {
//     console.error('Ride has no chatRoom field:', ride._id);
//   }

//   // Emit ride joined event
//   io.emit('ride_joined', {
//     ride: rideId,
//     user: userId,
//     seatBooked,
//     baggageType
//   });

//   // Notify ride creator about new join
//   if (!ride.creator.equals(userId)) {
//     await createNotificationService({
//       user: ride.creator,
//       type: 'join',
//       ride: rideId,
//       message: 'A new passenger joined your ride'
//     });
//   }

//   // Create notification for joining user
//   await createNotificationService({
//     user: userId,
//     type: 'join',
//     ride: rideId,
//     message: 'You successfully joined the ride'
//   });

//  // Fetch joined user with rating
// const joinedUser = await Booking.findById(booking._id)
//   .populate('user', 'name profileImage')
//   .lean();

// // Collect rating for this specific user
// const rating = await Rating.aggregate([
//   {
//     $match: {
//       ride: new mongoose.Types.ObjectId(rideId),
//       ratedUser: joinedUser.user._id
//     }
//   },
//   {
//     $group: {
//       _id: '$ratedUser',
//       avgRating: { $avg: '$rating' },
//       count: { $sum: 1 }
//     }
//   }
// ]);

// const avgRating = rating.length > 0 ? Number(rating[0].avgRating.toFixed(1)) : 0;

// // Format participant (only the just joined one)
// const participants = [
//   {
//     userId: joinedUser.user._id,
//     name: joinedUser.user.name,
//     profileImage: joinedUser.user.profileImage || '',
//     seatBooked: joinedUser.seatBooked,
//     baggageType: joinedUser.baggageType,
//     avgRating
//   }
// ];


//   // Re-fetch the booking with ride populated
//   const booking1 = await Booking.findById(booking._id).populate({
//     path: 'ride',
//     populate: [
//       { path: 'creator', select: 'name email profileImage' },
//       {
//         path: 'chatRoom',
//         populate: {
//           path: 'participants',
//           select: 'name email profileImage phoneNumber'
//         }
//       }
//     ]
//   });

//   const bookingObj = booking1.toObject();

//   // Attach participants under ride
//   return {
//     ...bookingObj,
//     ride: {
//       ...bookingObj.ride,
//       participants,
//       participantsCount: participants.length
//     }
//   };
// };



export const leaveRideService = async (rideId, userId) => {
  const ride = await Ride.findById(rideId).populate("chatRoom");
  if(!ride) throw new Error("Ride is not found!");
  if(ride.departureTime < new Date()) throw new Error("Sorry, ride departure time has passed! Cannot process leave-request.");

  const booking = await Booking.findOneAndUpdate(
    { ride: rideId, user: userId, status: "active" }, // Find with
    { status: "cancelled", leftAt: new Date() }, // Updates with
    { new: true }
  );
  if (!booking) throw new Error("Booking not found");

  const leavingUser = await User.findById(userId).select("name profileImage").lean();

  // --- CASE 1: Last passenger leaves ---
  if (ride.bookedSeats === booking.seatBooked) {
    if (ride.chatRoom) {
      await Message.deleteMany({ chatRoom: ride.chatRoom });
      await ChatRoom.deleteOne({ _id: ride.chatRoom });

      // Emit global chat deletion
      io.to(`room-${ride.chatRoom._id}`).emit("chatRoomDeleted", {
        roomId: ride.chatRoom._id
      });
    }

    await Booking.deleteMany({ ride: rideId });
    await Ride.deleteOne({ _id: rideId });

    io.emit("ride_deleted", { rideId });

    return;
  }

  // --- CASE 2: Normal leave ---
  ride.bookedSeats -= booking.seatBooked;

  // If creator leaves but others remain → transfer ownership
  if (ride.creator.equals(userId) && ride.bookedSeats > 0) {
    const newCreatorBooking = await Booking.findOne(
      { ride: rideId, status: "active" },
      null,
      { sort: { joinedAt: 1 } }
    );
    if (newCreatorBooking) {
      ride.creator = newCreatorBooking.user;
    }
  }

  await ride.save();

  // --- CHAT ROOM SECTION ---
  if (ride.chatRoom) {
    const chatRoom = await ChatRoom.findById(ride.chatRoom);
    if (chatRoom) {
      const activeBookingsForUser = await Booking.countDocuments({
        ride: rideId,
        user: userId,
        status: "active"
      });

      // Remove from participants if no active bookings
      if (activeBookingsForUser === 0) {
        chatRoom.participants = chatRoom.participants.filter(
          id => id.toString() !== userId.toString()
        );
        await chatRoom.save();

        // --- SYSTEM MESSAGE ---
        const systemMessage = await Message.create({
          chatRoom: chatRoom._id,
          sender: userId,
          message: `${leavingUser.name} left the ride`,
          type: "system"
        });

        // --- SOCKET EMITS (same structure as join) ---
        io.to(`room-${chatRoom._id}`).emit("userLeft", {
          participants: [
            {
              userId,
              name: leavingUser.name,
              profileImage: leavingUser.profileImage || "",
              seatBooked: booking.seatBooked,
              leftAt: booking.leftAt
            }
          ]
        });

        io.to(`room-${chatRoom._id}`).emit("newMessage", {
          type: "system",
          text: `${leavingUser.name} left the ride`,
          createdAt: systemMessage.createdAt
        });
      }

      // --- Delete chat room if only one or no seat left ---
      if (ride.bookedSeats < 2) {
        await Message.deleteMany({ chatRoom: chatRoom._id });
        await ChatRoom.deleteOne({ _id: chatRoom._id });

        io.to(`room-${chatRoom._id}`).emit("chatRoomDeleted", {
          roomId: chatRoom._id
        });
      }
    }
  }

  // --- NOTIFICATIONS ---
  await createNotificationService({
    user: userId,
    type: "leave",
    ride: rideId,
    message: "You left the ride"
  });

  if (!ride.creator.equals(userId)) {
    await createNotificationService({
      user: ride.creator,
      type: "leave",
      ride: rideId,
      message: `${leavingUser.name} left the ride`
    });
  }

  // --- GLOBAL RIDE EVENT (for dashboards, etc.) ---
  io.emit("ride_left", { ride: rideId, user: userId });

  // --- RESPONSE STRUCTURE (to mirror joinRideService) ---
  return {
    success: true,
    message: `${leavingUser.name} left the ride`,
    ride: {
      _id: ride._id,
      creator: ride.creator,
      bookedSeats: ride.bookedSeats,
      status: ride.status,
      chatRoom: ride.chatRoom ? ride.chatRoom._id : null
    },
    user: {
      _id: userId,
      name: leavingUser.name,
      profileImage: leavingUser.profileImage || ""
    }
  };
};




// export const leaveRideService = async (rideId, userId) => {
//   const ride = await Ride.findById(rideId).populate("chatRoom");
//   if (!ride || ride.status !== "active") throw new Error("Cannot leave ride");

//   const booking = await Booking.findOneAndUpdate(
//     { ride: rideId, user: userId, status: "active" },
//     { status: "cancelled", leftAt: new Date() },
//     { new: true }
//   );
//   if (!booking) throw new Error("Booking not found");

//   // CASE 1: Creator leaving and they are the ONLY participant
//   if (ride.creator.equals(userId) && ride.bookedSeats === booking.seatBooked) {
//     if (ride.chatRoom) {
//       await Message.deleteMany({ chatRoom: ride.chatRoom });
//       await ChatRoom.deleteOne({ _id: ride.chatRoom });
//     }
//     await Booking.deleteMany({ ride: rideId });
//     await Ride.deleteOne({ _id: rideId });
//     return;
//   }

//   // CASE 2: Normal leave
//   ride.bookedSeats -= booking.seatBooked;

//   // If creator leaves but others remain → transfer ownership
//   if (ride.creator.equals(userId) && ride.bookedSeats > 0) {
//     const newCreatorBooking = await Booking.findOne(
//       { ride: rideId, status: "active" },
//       null,
//       { sort: { joinedAt: 1 } }
//     );
//     if (newCreatorBooking) {
//       ride.creator = newCreatorBooking.user;
//     }
//   }

//   await ride.save();

//   // Handle chat room updates
//   if (ride.chatRoom) {
//     const chatRoom = await ChatRoom.findById(ride.chatRoom);

//     if (chatRoom) {
//       // 🔹 Check if this user still has active bookings
//       const activeBookingsForUser = await Booking.countDocuments({
//         ride: rideId,
//         user: userId,
//         status: "active"
//       });

//       // Only remove if NO active bookings left
//       if (activeBookingsForUser === 0) {
//         chatRoom.participants = chatRoom.participants.filter(
//           id => id.toString() !== userId.toString()
//         );
//         await chatRoom.save();

//         await Message.create({
//           chatRoom: chatRoom._id,
//           sender: userId,
//           message: "A user left the ride",
//           type: "system"
//         });

//         io.to(`room-${chatRoom._id}`).emit("userLeft", {
//           roomId: chatRoom._id,
//           userId,
//           rideId
//         });
//       }

//       // 🔴 Always delete chat room if ride has less than 2 booked seats
//       if (ride.bookedSeats < 2) {
//         await Message.deleteMany({ chatRoom: chatRoom._id });
//         await ChatRoom.deleteOne({ _id: chatRoom._id });

//         io.to(`room-${chatRoom._id}`).emit("chatRoomDeleted", {
//           roomId: chatRoom._id
//         });
//       }
//     }
//   }

//   // Create notification for leaver
//   await createNotificationService({
//     user: userId,
//     type: "leave",
//     ride: rideId,
//     message: "You left the ride"
//   });
// };




export const finishRideService = async (rideId, userId) => {
  const ride = await Ride.findById(rideId).populate("chatRoom");
  if (!ride) throw new Error("Ride is not found!");
  if (ride.status === "completed") throw new Error("Ride is already completed!");

  // 1. Mark user's booking as completed
  const booking = await Booking.findOneAndUpdate(
    { ride: rideId, user: userId, status: "active" },
    { status: "completed", leftAt: new Date() },
    { new: true }
  );
  if (!booking) throw new Error("Active booking not found for this user");

  // Store participant count BEFORE updating
  const originalCount = ride.bookedSeats;

  // 2. Decrease bookedSeats
  ride.bookedSeats = Math.max(ride.bookedSeats - booking.seatBooked, 0);
  await ride.save();

  // 3. Handle chat room updates
  let chatRoomDeleted = false;
  if (ride.chatRoom) {
    const chatRoom = await ChatRoom.findById(ride.chatRoom);
    if (chatRoom) {
      // Remove user from participants
      chatRoom.participants = chatRoom.participants.filter(
        id => id.toString() !== userId.toString()
      );
      await chatRoom.save();

      const activeCount = chatRoom.participants.length;

      // If remaining participants < 50% of original OR only 1 left → delete chat room
      if (activeCount < Math.ceil(originalCount * 0.5) || activeCount <= 1) {
        await Message.deleteMany({ chatRoom: chatRoom._id });
        await ChatRoom.deleteOne({ _id: chatRoom._id });
        chatRoomDeleted = true;

        io.to(`room-${chatRoom._id}`).emit("chatRoomDeleted", {
          roomId: chatRoom._id
        });
      } else {
        // Otherwise → log system message & emit
        await Message.create({
          chatRoom: chatRoom._id,
          sender: userId, // or null if you allow system messages
          message: `A participant has finished their ride.`,
          type: "system"
        });

        io.to(`room-${chatRoom._id}`).emit("userFinishedRide", {
          roomId: chatRoom._id,
          userId,
          rideId
        });
      }
    }
  }

  // 4. If this was the last participant → complete ride
  const remainingActiveBookings = await Booking.countDocuments({
    ride: rideId,
    status: "active"
  });
  if (remainingActiveBookings === 0) {
    ride.status = "completed";
    await ride.save();
  }

  // 5. Notify user
  await createNotificationService({
    user: userId,
    type: "finish",
    ride: ride._id,
    message: "You finished the ride. Please rate your companions."
  });

  return { ride, booking, chatRoomDeleted };
};


export const transferOwnershipService = async (rideId, currentUserId) => {
  const ride = await Ride.findById(rideId);
  if (!ride || !ride.creator.equals(currentUserId))
    throw new Error('Unauthorized');

  const firstBooking = await Booking.findOne(
    { ride: rideId, status: 'active' },
    null,
    { sort: { joinedAt: 1 } }
  );
  if (!firstBooking) throw new Error('No eligible user to transfer to');

  ride.newCreator = firstBooking.user;
  await ride.save();
  return ride;
};



export const voteKickUserService = async (rideId, voterId, targetUserId) => {
  if (voterId === targetUserId)
    throw new Error('You cannot vote to kick yourself');

  const ride = await Ride.findById(rideId).populate('chatRoom');
  if (!ride) throw new Error('Ride not found');
  if (ride.creator.toString() === targetUserId)
    throw new Error('Cannot kick the ride creator');

  // Find existing vote record for this target user
  let existing = ride.kickedVotes.find(
    (k) => k.targetUser.toString() === targetUserId
  );

  let voteAdded = false;

  if (existing) {
    if (!existing.votedBy.includes(voterId)) {
      existing.votedBy.push(voterId);
      voteAdded = true;
    }
  } else {
    existing = { targetUser: targetUserId, votedBy: [voterId] };
    ride.kickedVotes.push(existing);
    voteAdded = true;
  }

  await ride.save();

  // Send notifications for the vote
  if (voteAdded) {
    // Notify the target user
    await createNotificationService({
      user: targetUserId,
      type: 'kick',
      ride: rideId,
      message: 'A participant has voted to kick you from the ride'
    });

    // Notify other active participants except voter and target
    const otherBookings = await Booking.find({
      ride: rideId,
      status: 'active',
      user: { $nin: [voterId, targetUserId] }
    });

    for (const otherBooking of otherBookings) {
      await createNotificationService({
        user: otherBooking.user,
        type: 'kick',
        ride: rideId,
        message: 'A kick vote has been cast in your ride'
      });
    }

    // Optional: Add a system message to chat room about the vote
    if (ride.chatRoom) {
      await Message.create({
        chatRoom: ride.chatRoom,
        sender: null,
        message: `A vote to kick a user has been cast`,
        type: "system"
      });
    }
  }

  // Check if 50% vote threshold is reached
  const voteCount = existing.votedBy.length;
  const requiredVotes = Math.ceil(ride.bookedSeats * 0.5);

  if (voteCount >= requiredVotes) {
    // Kick the user
    const booking = await Booking.findOneAndUpdate(
      { ride: rideId, user: targetUserId, status: 'active' },
      { 
        status: 'cancelled',
        leftAt: new Date(),
        kicked: true,
        cancelReason: 'Kicked by majority vote'
      },
      { new: true }
    );

    if (booking) {
      // Update ride booked seats
      ride.bookedSeats -= booking.seatBooked;
      await ride.save();

      // Remove from chat room
      if (ride.chatRoom) {
        const chatRoom = await ChatRoom.findById(ride.chatRoom);
        if (chatRoom) {
          const idx = chatRoom.participants.findIndex(id => id.toString() === targetUserId);
          if (idx !== -1) {
            chatRoom.participants.splice(idx, 1);
            await chatRoom.save();

            // System message for kick
            await Message.create({
              chatRoom: ride.chatRoom,
              sender: null,
              message: `A user was kicked from the ride by majority vote`,
              type: "system"
            });

            // Emit chat room event
            io.to(`room-${ride.chatRoom}`).emit('userKicked', { 
              roomId: ride.chatRoom, 
              userId: targetUserId,
              rideId 
            });
          }
        }
      }

      // Global event
      io.emit('user_kicked', { ride: rideId, user: targetUserId, reason: 'Majority vote' });

      // Notify kicked user
      await createNotificationService({
        user: targetUserId,
        type: 'kick',
        ride: rideId,
        message: 'You have been kicked from the ride by majority vote'
      });

      // Notify remaining participants
      const remainingBookings = await Booking.find({ ride: rideId, status: 'active' });
      for (const b of remainingBookings) {
        await createNotificationService({
          user: b.user,
          type: 'kick',
          ride: rideId,
          message: 'A user was kicked from the ride'
        });
      }
    }
  } else {
    // Emit vote progress event
    io.emit('kick_vote_started', {
      ride: rideId,
      targetUser: targetUserId,
      currentVotes: voteCount,
      requiredVotes
    });
  }

  return ride;
};


export const getKickVoteStatusService = async (rideId, userId) => {
  const ride = await Ride.findById(rideId).lean();
  if (!ride) throw new Error('Ride not found');

  const vote = ride.kickedVotes.find((k) => k.targetUser.toString() === userId);
  if (!vote) return { totalVotes: 0, votedBy: [], eligible: false };

  const eligible = vote.votedBy.length >= Math.ceil(ride.bookedSeats * 0.5);
  return {
    totalVotes: vote.votedBy.length,
    votedBy: vote.votedBy,
    eligible
  };
};

export const getRideParticipantsService = async (rideId) => {
  const bookings = await Booking.find({ ride: rideId, status: 'active' })
    .populate('user', 'name email avatar')
    .lean();

  const participantIds = bookings.map((b) => b.user._id);

  // Get all ratings received by these users for this ride
  const ratings = await Rating.aggregate([
    {
      $match: {
        ride: new mongoose.Types.ObjectId(rideId),
        ratedUser: { $in: participantIds }
      }
    },
    {
      $group: {
        _id: '$ratedUser',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 }
      }
    }
  ]);

  const ratingMap = {};
  ratings.forEach((r) => {
    ratingMap[r._id.toString()] = {
      avgRating: r.avgRating.toFixed(1),
      ratingCount: r.count
    };
  });

  return bookings.map((b) => ({
    user: {
      ...b.user,
      avgRating: ratingMap[b.user._id.toString()]?.avgRating || null,
      ratingCount: ratingMap[b.user._id.toString()]?.ratingCount || 0
    },
    seatBooked: b.seatBooked,
    baggageType: b.baggageType,
    joinedAt: b.joinedAt
  }));
};

export const setMeetPointService = async (rideId, userId, meetPoint) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');
  if (!ride.creator.equals(userId))
    throw new Error('Only creator can set meet point');

  ride.meetPoint = meetPoint;
  await ride.save();

  return ride;
};



export const rateRideParticipantsService = async (rideId, raterId, ratings) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Ensure rater is a valid participant of this ride
    const raterBooking = await Booking.findOne({
      ride: rideId,
      user: raterId,
      status: 'active'
    }).session(session);

    if (!raterBooking) throw new Error('You are not a participant of this ride');

    if (!Array.isArray(ratings) || ratings.length === 0) {
      await session.commitTransaction();
      session.endSession();
      return { success: true, ratedCount: 0 };
    }

    const bulkRatings = [];

    for (const { userId, score } of ratings) {
      if (String(userId) === String(raterId)) {
        throw new Error("You can't rate yourself");
      }

      // Check participant validity
      const targetBooking = await Booking.findOne({
        ride: rideId,
        user: userId,
        status: 'active'
      }).session(session);
      if (!targetBooking) continue; // skip invalid users

      // Skip duplicates (unique index protects too)
      const exists = await Rating.findOne({
        ride: rideId,
        rater: raterId,
        ratedUser: userId
      }).session(session);
      if (exists) continue;

      bulkRatings.push({
        ride: rideId,
        rater: raterId,
        ratedUser: userId,
        rating: score
      });
    }

    if (bulkRatings.length > 0) {
      await Rating.insertMany(bulkRatings, { session });

      // Emit + notify
      for (const r of bulkRatings) {
        io.emit('got_rated', {
          ride: r.ride,
          ratedUser: r.ratedUser,
          rater: r.rater,
          rating: r.rating
        });

        await createNotificationService({
          user: r.ratedUser,
          type: 'rating',
          ride: r.ride,
          message: `You received a ${r.rating}-star rating from a companion`
        });
      }
    }

    await session.commitTransaction();
    session.endSession();

    return { success: true, ratedCount: bulkRatings.length };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
